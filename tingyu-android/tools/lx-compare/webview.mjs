// WebView 侧执行器（对照台的另一端）。
//
// 这一段刻意复用**应用里正在用的那两份源码**，一行都不重写：
//   - src/services/lxSource/bootstrap.ts 里的 lxBootstrap（脚本看到的 lx.* 宿主）
//   - src/services/lxSource/http.ts      里的 lxHttp（脚本请求 → HTTP 的映射）
//   - src/services/lxSource/utilities.ts 里的 lxUtility（md5/aes/buffer…）
// 只是把它们转成 Node 能直接跑的模块，并把 @capacitor/core 换成记账用的替身。
// 这样"同一首歌在 WebView 侧发出的是什么请求"才是真的，不是我们复述的。
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

const APP = resolve(arg('app', join(HERE, '../../..')));
const SCRIPT = resolve(arg('script', ''));
const MUSIC_INFO = resolve(arg('music-info', ''));
const SOURCE = arg('source', 'tx');
const QUALITY = arg('quality', '320k');
const TIMEOUT = Number(arg('timeout', '45000'));
const LX_DIR = join(APP, 'src/services/lxSource');

// ---------------------------------------------------------------- 生成可执行的模块
// 必须落在工程目录内：临时目录放系统 temp 会让生成的模块找不到 node_modules。
const TMP = join(HERE, `.tmp-${process.pid}-${Date.now()}`);
mkdirSync(TMP, { recursive: true });

const rewrite = (file, out, replacements) => {
    let code = readFileSync(join(LX_DIR, file), 'utf8');
    for (const [from, to] of replacements) code = code.split(from).join(to);
    writeFileSync(join(TMP, out), code, 'utf8');
};

// TS 类型注解由 Node 的类型剥离直接吃掉，源码语义不变。
rewrite('http.ts', 'http.mts', [["from './contract'", "from './contract.mts'"], ["from '@capacitor/core'", "from './capacitor-stub.mjs'"]]);
rewrite('contract.ts', 'contract.mts', []);
rewrite('utilities.ts', 'utilities.mts', []);
copyFileSync(join(HERE, 'capacitor-stub.mjs'), join(TMP, 'capacitor-stub.mjs'));

// ---------------------------------------------------------------- 取出应用里的 bootstrap
const bootstrapSource = readFileSync(join(LX_DIR, 'bootstrap.ts'), 'utf8');
const bootstrapCode = bootstrapSource.match(/export const lxBootstrap\s*=\s*`([\s\S]*?)`;/)?.[1];
if (!bootstrapCode) throw Error('无法从 bootstrap.ts 取出 lxBootstrap');
const utilities = await import(pathToFileURL(join(TMP, 'utilities.mts')).href);
const lxHttpModule = await import(pathToFileURL(join(TMP, 'http.mts')).href);
const stub = await import(pathToFileURL(join(TMP, 'capacitor-stub.mjs')).href);
stub.resetRecords();

// ---------------------------------------------------------------- 起 QuickJS
const { newQuickJSWASMModuleFromVariant, newVariant } = await import('quickjs-emscripten-core');
const RELEASE_SYNC = (await import('@jitl/quickjs-wasmfile-release-sync')).default;
const QuickJS = await newQuickJSWASMModuleFromVariant(newVariant(RELEASE_SYNC, {}));
const vm = QuickJS.newContext();
// 与 runtime.worker.ts 一致的内存/栈约束；内存上调到 64MB（真脚本会缓存链路结果）。
vm.runtime.setMemoryLimit(64 * 1024 * 1024);
vm.runtime.setMaxStackSize(256 * 1024);

let deadline = 0;
const timers = new Map();
const queue = [];
let capabilities = null;
let result = null;

vm.runtime.setInterruptHandler(() => Date.now() > deadline);

function run(code) {
    deadline = Date.now() + 5000;
    vm.unwrapResult(vm.evalCode(code)).dispose();
    let jobs = 0;
    while (vm.runtime.hasPendingJob()) {
        if (++jobs > 200000 || Date.now() > deadline) throw Error('音源脚本执行超时');
        vm.runtime.executePendingJobs(1).unwrap();
    }
}

const emitHandle = vm.newFunction('emit', input => {
    const message = JSON.parse(vm.getString(input));
    if (message.kind === 'inited') {
        capabilities = message.data;
        return;
    }
    if (message.kind === 'result') {
        result = message;
        return;
    }
    queue.push(message);
});
vm.setProp(vm.global, '__emit', emitHandle);

const utilityHandle = vm.newFunction('utility', input => vm.newString(utilities.lxUtility(vm.getString(input))));
vm.setProp(vm.global, '__utility', utilityHandle);

// ---------------------------------------------------------------- 跑脚本
const scriptCode = readFileSync(SCRIPT, 'utf8');
const musicInfo = JSON.parse(readFileSync(MUSIC_INFO, 'utf8'));
run(bootstrapCode);
run(`lx.currentScriptInfo=${JSON.stringify({ name: 'lx-compare', version: '0', description: '', author: '', homepage: '' })};`);
run(scriptCode);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const abort = new AbortController();

async function handle(message) {
    if (message.kind === 'timer') {
        const id = setTimeout(() => run(`__deliver(${JSON.stringify({ id: message.id, timer: true })});`), Math.min(15000, Number(message.ms) || 0));
        timers.set(message.id, id);
        return;
    }
    if (message.kind === 'cancel') {
        const id = timers.get(message.id);
        if (id) clearTimeout(id);
        timers.delete(message.id);
        return;
    }
    if (message.kind === 'http') {
        try {
            const response = await lxHttpModule.lxHttp(message.url, message.options || {}, abort.signal, 0);
            run(`__deliver(${JSON.stringify({ id: message.id, response })});`);
        } catch (error) {
            run(`__deliver(${JSON.stringify({ id: message.id, error: String(error?.message || error) })});`);
        }
    }
}

async function pump(timeoutMs) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        while (queue.length) await handle(queue.shift());
        if (result) return;
        if (!queue.length) await sleep(10);
    }
}

const payload = { id: 1, payload: { source: SOURCE, action: 'musicUrl', info: { type: QUALITY, musicInfo } } };
let fatal = '';
try {
    run(`__request(${JSON.stringify(payload)});`);
    await pump(TIMEOUT);
} catch (error) {
    fatal = String(error?.message || error);
}

const out = {
    records: stub.records,
    capabilities: capabilities ? Object.keys(capabilities).sort().join(',') : '',
    ok: Boolean(result && !result.error && result.value),
    reason: result?.error ? String(result.error).slice(0, 200) : fatal,
    resolved: result?.value ?? '',
    resolvedHost: result?.value ? (() => { try { return new URL(result.value).hostname; } catch { return '?'; } })() : '',
};
if (out.ok) out.playable = await probeUrl(out.resolved);
const outFile = arg('out', '');
if (outFile) writeFileSync(outFile, JSON.stringify(out), 'utf8');
console.log(JSON.stringify(out));

// 不走 vm.dispose()：取证进程结束即释放，走 dispose 会触发 QuickJS 的 gc_obj_list 断言
// （句柄没逐个释放），与本轮要验证的东西无关，反而会污染输出。
rmSync(TMP, { recursive: true, force: true });
process.exit(0);

async function probeUrl(url) {
    try {
        const response = await fetch(url, { headers: { Range: 'bytes=0-0' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
        return `${response.status} ${response.headers.get('content-type') || '-'}`;
    } catch (error) {
        return `PROBE FAILED ${error.name}`;
    }
}
