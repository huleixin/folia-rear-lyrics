// 双引擎对照：同一份脚本、同一首真实歌曲、同一个音质，
// 分别在「WebView 侧执行器（bootstrap.ts + http.ts + CapacitorHttp 记账替身 + quickjs-emscripten）」
// 和「原生侧执行器（lx/LxBootstrap + lx/LxHttp + OkHttp）」里跑一遍，
// 把两端真正发出去的 HTTP 请求逐字段对照。所有敏感值脱敏。
//
// 两侧各产出一个 JSON（见 README.md 的三条命令），这里只负责对照：
//   node compare.mjs --webview <webview.json> --native <native.json>
import { readFileSync } from 'node:fs';

function arg(name) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : '';
}

const webviewPath = arg('webview');
const nativePath = arg('native');
if (!webviewPath || !nativePath) {
    console.error('usage: node compare.mjs --webview <webview.json> --native <native.json>');
    process.exit(2);
}
const webview = JSON.parse(readFileSync(webviewPath, 'utf8'));
const native = JSON.parse(readFileSync(nativePath, 'utf8'));

function table(label, data) {
    console.log(`\n-- ${label} --`);
    console.log(`   能力表 ${data.capabilities || '-'}`);
    (data.records || []).forEach((record, index) => {
        console.log(`   #${index + 1} ${record.method} ${record.host}${record.path}  status=${record.status ?? '-'}`);
        console.log(`       contentType=${record.contentType || '-'}  body=${record.body || '-'}  optionKeys=${record.optionKeys ?? '-'}`);
        console.log(`       url=${record.url}`);
    });
    console.log(`   结果 ok=${data.ok} reason=${data.reason || '-'} host=${data.resolvedHost || '-'} playable=${data.playable || '-'}`);
}

table('WebView 侧（bootstrap.ts + http.ts + CapacitorHttp）', webview);
table('原生侧（LxBootstrap + LxHttp + OkHttp）', native);

const FIELDS = ['method', 'host', 'path', 'queryKeys', 'contentType', 'body'];
let mismatches = 0;
console.log('\n-- 逐字段对照 --');
const count = Math.max((webview.records || []).length, (native.records || []).length);
for (let index = 0; index < count; index++) {
    const left = (webview.records || [])[index];
    const right = (native.records || [])[index];
    if (!left || !right) {
        console.log(`   #${index + 1} 只有一侧有请求（webview=${Boolean(left)} native=${Boolean(right)}）`);
        mismatches++;
        continue;
    }
    const diffs = FIELDS.filter(field => String(left[field] ?? '') !== String(right[field] ?? ''));
    if (!diffs.length) {
        console.log(`   #${index + 1} 一致  ${left.method} ${left.host}${left.path}`);
    } else {
        mismatches++;
        console.log(`   #${index + 1} 不一致  字段：${diffs.join(', ')}`);
        for (const field of diffs) {
            console.log(`       ${field}: webview=${JSON.stringify(left[field] ?? '')} native=${JSON.stringify(right[field] ?? '')}`);
        }
    }
}
const sameOutcome = Boolean(webview.ok) === Boolean(native.ok);
console.log(`\n   结果一致性：${sameOutcome ? '一致' : '不一致'}（webview ok=${webview.ok} / native ok=${native.ok}）`);
if (!sameOutcome) mismatches++;

console.log(`\n== 对照结论：${mismatches === 0 ? '两端一致' : `${mismatches} 处不一致`} ==`);
process.exit(mismatches === 0 ? 0 : 1);
