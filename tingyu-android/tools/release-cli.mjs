#!/usr/bin/env node
// tools/release-cli.mjs
// 听屿统一发布与验证命令行工具（供开发者及本地 AI 工具 Codex / WorkBuddy 调用）。
// 严格安全边界：
// 1. 绝不在命令行参数、终端日志、临时明文文件或 Git 历史中输出任何密钥或 Token。
// 2. prepare / upload / verify 仅处理候选包与预发布附件，绝不将正式渠道 updateEnabled 置为 true。
// 3. 正式推送策略必须经人工审核（approved_digest 绑定）并显式提供独立发布确认权限。

import { createHash, randomBytes } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
    createWriteStream,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    TINGYU_APP_ID,
    ALLOWED_CHANNELS,
    DEFAULT_OFFLINE_GRACE_HOURS,
    signUpdateManifest,
    verifyUpdateManifest,
} from '../shared/updateProtocol.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const WORK_DIR = path.join(PROJECT_ROOT, '.release-work');
const TRUST_ANCHORS_PATH = path.join(PROJECT_ROOT, 'shared', 'updateTrustAnchors.json');

const CNB_REPO = 'tingyu-2026/releases';
const CNB_GIT_URL = 'https://cnb.cool/tingyu-2026/releases.git';
const CNB_RAW_BASE = 'https://cnb.cool/tingyu-2026/releases/-/git/raw/main';
const CONSOLE_API_BASE = 'https://feedback.20262000.xyz';
const EXPECTED_CERT_SHA256 = 'a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d';

function parseArgs(argv) {
    const positional = [];
    const flags = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('--')) {
                flags[key] = next;
                i++;
            } else {
                flags[key] = true;
            }
        } else {
            positional.push(arg);
        }
    }
    return { command: positional[0] || 'help', positional: positional.slice(1), flags };
}

function readDpapiSlot(slot) {
    const pyScript = path.join(__dirname, 'release_credentials.py');
    const res = spawnSync('python', [pyScript, '--ipc-stdin'], {
        cwd: PROJECT_ROOT,
        input: JSON.stringify({ slot }),
        encoding: 'utf8',
        env: { ...process.env, TINGYU_INTERNAL_IPC: '1' },
    });
    if (res.status !== 0) {
        throw new Error(`无法从系统安全凭据库读取槽位 [${slot}]，请先运行 python tools/release_credentials.py --prepare`);
    }
    return JSON.parse(res.stdout);
}

function loadTrustedPublicKeys() {
    const doc = JSON.parse(readFileSync(TRUST_ANCHORS_PATH, 'utf8'));
    const map = {};
    for (const [k, v] of Object.entries(doc.keys || {})) {
        map[k] = v.spkiBase64;
    }
    return map;
}

function findAndroidBuildToolsDir() {
    const localPropsPath = path.join(PROJECT_ROOT, 'android', 'local.properties');
    let sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
    if (!sdkDir && existsSync(localPropsPath)) {
        const content = readFileSync(localPropsPath, 'utf8');
        const m = /^sdk\.dir=(.+)$/m.exec(content);
        if (m) {
            sdkDir = m[1].trim().replace(/\\\\/g, '\\').replace(/\\:/g, ':');
        }
    }
    if (!sdkDir || !existsSync(path.join(sdkDir, 'build-tools'))) {
        throw new Error('未定位到 Android SDK build-tools 目录');
    }
    const versions = readdirSync(path.join(sdkDir, 'build-tools')).sort();
    if (!versions.length) throw new Error('build-tools 为空');
    return path.join(sdkDir, 'build-tools', versions[versions.length - 1]);
}

function sha256File(filePath) {
    const hash = createHash('sha256');
    hash.update(readFileSync(filePath));
    return hash.digest('hex');
}

function defaultApkPath(pkg) {
    const releaseOut = path.join(PROJECT_ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    if (existsSync(releaseOut)) return releaseOut;
    const archived = path.join('d:\\tingyu\\releases', pkg.version, `tingyu-${pkg.version}-release.apk`);
    if (existsSync(archived)) return archived;
    const inRepo = path.join(PROJECT_ROOT, 'releases', `tingyu-${pkg.version}-release.apk`);
    if (existsSync(inRepo)) return inRepo;
    return releaseOut;
}

export function inspectLocalApk(apkPath) {
    if (!existsSync(apkPath)) {
        throw new Error(`找不到 APK 文件: ${apkPath}`);
    }
    const stat = statSync(apkPath);
    if (stat.size < 1024 * 1024) {
        throw new Error(`APK 体积异常过小 (${stat.size} bytes)`);
    }
    const sha256 = sha256File(apkPath);
    const btDir = findAndroidBuildToolsDir();
    const isWin = process.platform === 'win32';
    const apksignerBin = path.join(btDir, isWin ? 'apksigner.bat' : 'apksigner');
    const aapt2Bin = path.join(btDir, isWin ? 'aapt2.exe' : 'aapt2');

    // 1. Verify APK signature & extract signer SHA-256 (call apksigner.jar directly via java to avoid Windows cmd quote escaping)
    const apksignerJar = path.join(btDir, 'lib', 'apksigner.jar');
    const sigRes = existsSync(apksignerJar)
        ? spawnSync('java', ['-jar', apksignerJar, 'verify', '--print-certs', apkPath], { encoding: 'utf8' })
        : spawnSync(apksignerBin, ['verify', '--print-certs', apkPath], { encoding: 'utf8', shell: isWin });
    if (sigRes.status !== 0) {
        throw new Error(`APK 签名校验失败: ${(sigRes.stderr || sigRes.stdout).slice(0, 300)}`);
    }
    const certMatch = /Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9]{64})/.exec(sigRes.stdout);
    const apkCertSha256 = certMatch ? certMatch[1].toLowerCase() : '';
    if (apkCertSha256 !== EXPECTED_CERT_SHA256) {
        throw new Error(`APK 签名证书不匹配！实际=${apkCertSha256}，预期=${EXPECTED_CERT_SHA256}`);
    }

    // 2. Dump badging via aapt2 for packageName, versionCode, versionName, minSdk, ABIs
    const badgeRes = spawnSync(aapt2Bin, ['dump', 'badging', apkPath], { encoding: 'utf8' });
    if (badgeRes.status !== 0) {
        throw new Error(`aapt2 解析 APK 元信息失败: ${(badgeRes.stderr || badgeRes.stdout).slice(0, 300)}`);
    }
    const badge = badgeRes.stdout;
    const pkgMatch = /package:\s+name='([^']+)'\s+versionCode='(\d+)'\s+versionName='([^']+)'/.exec(badge);
    if (!pkgMatch) throw new Error('无法从 APK 读取包名与版本号');
    const [, packageName, vCodeStr, versionName] = pkgMatch;
    if (packageName !== TINGYU_APP_ID) {
        throw new Error(`APK 包名不匹配！实际=${packageName}，预期=${TINGYU_APP_ID}`);
    }
    const minSdkMatch = /sdkVersion:'(\d+)'/.exec(badge);
    const minSdk = minSdkMatch ? Number(minSdkMatch[1]) : 24;
    const abiMatch = /native-code:\s+([^\r\n]+)/.exec(badge);
    const supportedAbis = abiMatch
        ? [...abiMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1])
        : ['arm64-v8a', 'armeabi-v7a'];

    return {
        apkPath,
        packageName,
        versionName,
        versionCode: Number(vCodeStr),
        apkSizeBytes: stat.size,
        sha256,
        apkCertSha256,
        minSdk,
        supportedAbis,
    };
}

function collectRecentGitNotes() {
    const headRes = spawnSync('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' });
    const gitCommit = (headRes.stdout || '').trim();
    const logRes = spawnSync('git', ['log', '-n', '8', '--pretty=format:- %s (%h)'], { cwd: PROJECT_ROOT, encoding: 'utf8' });
    const commits = (logRes.stdout || '').trim();
    return { gitCommit, commits };
}

async function consoleRequest(pathname, { method = 'GET', slot = 'read', extraHeaders = {}, body } = {}) {
    const cred = readDpapiSlot(slot);
    const baseUrl = (cred.url || CONSOLE_API_BASE).replace(/\/+$/, '');
    const headers = {
        Authorization: `Bearer ${cred.token}`,
        ...extraHeaders,
    };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
    if (!res.ok) {
        throw new Error(`云端管理中心接口返回 HTTP ${res.status}: ${data?.error || text.slice(0, 200)}`);
    }
    return data;
}

function runCnbJson(args) {
    const isWin = process.platform === 'win32';
    const cmdLine = ['cnb', ...args.map(a => `"${String(a).replace(/"/g, '""')}"`), '-v'].join(' ');
    const res = isWin
        ? spawnSync('cmd.exe', ['/d', '/s', '/c', `"${cmdLine}"`], {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
            windowsVerbatimArguments: true,
        })
        : spawnSync('cnb', [...args, '-v'], { cwd: PROJECT_ROOT, encoding: 'utf8' });
    const out = (res.stdout || '').trim();
    try {
        const parsed = JSON.parse(out);
        if (res.status !== 0 || (parsed.status && parsed.status >= 400)) {
            throw new Error(`CNB API 返回异常 (status=${parsed.status || res.status})`);
        }
        return parsed.data ?? parsed;
    } catch (e) {
        if (res.status !== 0) {
            throw new Error(`CNB CLI 执行失败: ${(res.stderr || out).slice(0, 300)}`);
        }
        throw e;
    }
}

async function fullDownloadAndVerifyUrl(url, expectedSha256, expectedSizeBytes) {
    mkdirSync(WORK_DIR, { recursive: true });
    const tmpFile = path.join(WORK_DIR, `verify-${Date.now()}.apk.tmp`);
    const started = Date.now();
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Tingyu-ReleaseCLI-FullVerifier/1.0' },
            redirect: 'follow',
        });
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok) {
            return {
                accessible: false,
                httpStatus: res.status,
                sizeBytes: 0,
                sha256: '',
                latencyMs: Date.now() - started,
                detail: `http_${res.status}`,
            };
        }
        if (contentType.includes('text/html')) {
            return {
                accessible: false,
                httpStatus: res.status,
                sizeBytes: 0,
                sha256: '',
                latencyMs: Date.now() - started,
                detail: 'html_page_rejected',
            };
        }
        await pipeline(Readable.fromWeb(res.body), createWriteStream(tmpFile));
        const stat = statSync(tmpFile);
        const actualSha256 = sha256File(tmpFile);
        const elapsedMs = Date.now() - started;
        const sizeMatch = expectedSizeBytes <= 0 || stat.size === expectedSizeBytes;
        const hashMatch = !expectedSha256 || actualSha256 === expectedSha256.toLowerCase();
        return {
            accessible: sizeMatch && hashMatch,
            httpStatus: res.status,
            sizeBytes: stat.size,
            sha256: actualSha256,
            latencyMs: elapsedMs,
            checkedAt: Date.now(),
            detail: !sizeMatch
                ? `size_mismatch:${stat.size}!=${expectedSizeBytes}`
                : !hashMatch
                    ? `sha256_mismatch:${actualSha256.slice(0, 12)}`
                    : 'full_download_sha256_verified',
        };
    } finally {
        try { if (existsSync(tmpFile)) rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
}

function pushStaticManifestsToCnbGit(manifestsByRelPath, commitMessage) {
    const tmpRepo = mkdtempSync(path.join(tmpdir(), 'tingyu-cnb-sync-'));
    try {
        const clone = spawnSync('git', ['clone', '--depth', '1', CNB_GIT_URL, tmpRepo], { encoding: 'utf8' });
        if (clone.status !== 0) {
            throw new Error(`克隆 CNB 发布仓库失败: ${(clone.stderr || clone.stdout).slice(0, 240)}`);
        }
        spawnSync('git', ['config', 'user.name', 'Tingyu Release Bot'], { cwd: tmpRepo });
        spawnSync('git', ['config', 'user.email', 'tingyu-release@noreply.cnb.cool'], { cwd: tmpRepo });

        for (const [relPath, jsonString] of Object.entries(manifestsByRelPath)) {
            const target = path.join(tmpRepo, relPath);
            mkdirSync(path.dirname(target), { recursive: true });
            writeFileSync(target, jsonString.endsWith('\n') ? jsonString : jsonString + '\n', 'utf8');
        }

        spawnSync('git', ['add', '.'], { cwd: tmpRepo });
        const diff = spawnSync('git', ['status', '--porcelain'], { cwd: tmpRepo, encoding: 'utf8' });
        if (!(diff.stdout || '').trim()) {
            return { changed: false };
        }
        const commit = spawnSync('git', ['commit', '-m', commitMessage], { cwd: tmpRepo, encoding: 'utf8' });
        if (commit.status !== 0) {
            throw new Error(`提交静态策略文件失败: ${(commit.stderr || commit.stdout).slice(0, 240)}`);
        }
        const push = spawnSync(
            'git',
            ['-c', 'credential.helper=', '-c', 'credential.helper=!cnb git-credential', 'push', 'origin', 'main'],
            { cwd: tmpRepo, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } },
        );
        if (push.status !== 0) {
            throw new Error(`推送静态策略至 CNB 失败: ${(push.stderr || push.stdout).slice(0, 240)}`);
        }
        return { changed: true };
    } finally {
        try { rmSync(tmpRepo, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

async function cmdBuild() {
    console.log('▶ 开始本地构建正式签名 APK（不修改版本号、不上传、不触发任何线上推送）...');
    const isWin = process.platform === 'win32';
    const build = isWin
        ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm run build:android:release'], { cwd: PROJECT_ROOT, stdio: 'inherit' })
        : spawnSync('npm', ['run', 'build:android:release'], { cwd: PROJECT_ROOT, stdio: 'inherit' });
    if (build.status !== 0) {
        throw new Error('Android Release 本地构建失败');
    }
    const pkg = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
    const info = inspectLocalApk(defaultApkPath(pkg));
    console.log(JSON.stringify({ ok: true, stage: 'local_build_only', apk: info }, null, 2));
}

async function cmdPrepare(flags) {
    const channel = String(flags.channel || 'testing');
    if (!ALLOWED_CHANNELS.includes(channel)) throw new Error(`不支持的发布渠道: ${channel}`);
    const pkg = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
    const apkPath = flags.apk ? path.resolve(flags.apk) : defaultApkPath(pkg);
    const apk = inspectLocalApk(apkPath);
    const { gitCommit, commits } = collectRecentGitNotes();

    const forceUpdate = flags['optional-update'] ? false : true;
    const minSupportedVersionCode = flags['min-supported']
        ? Number(flags['min-supported'])
        : (forceUpdate ? apk.versionCode : 1);

    const releaseNotes = flags.notes
        ? String(flags.notes)
        : `听屿 v${apk.versionName} (${apk.versionCode}) 候选更新说明：\n${commits || '- 日常稳定性与体验优化'}`;

    const cnbTag = String(flags.tag || (channel === 'stable' ? `v${apk.versionName}` : `candidate-${apk.versionName}-${apk.versionCode}`));
    const downloadUrls = [];
    if (flags['cnb-url']) {
        downloadUrls.push({
            id: 'cnb-primary',
            label: 'CNB 国内高速主节点',
            url: String(flags['cnb-url']),
            priority: 1,
        });
    }
    if (flags['github-url']) {
        downloadUrls.push({
            id: 'github-backup',
            label: 'GitHub 备用节点',
            url: String(flags['github-url']),
            priority: 2,
        });
    }

    const draft = {
        id: `rel-${channel}-${apk.versionName}-${apk.versionCode}`,
        channel,
        status: 'candidate',
        versionName: apk.versionName,
        versionCode: apk.versionCode,
        minSupportedVersionCode,
        forceUpdate,
        apkSizeBytes: apk.apkSizeBytes,
        sha256: apk.sha256,
        apkCertSha256: apk.apkCertSha256,
        minSdk: apk.minSdk,
        supportedAbis: apk.supportedAbis,
        gitCommit,
        cnbTag,
        releaseNotes,
        apkLocalPath: apk.apkPath,
        downloadUrls,
        preparedAt: new Date().toISOString(),
    };

    mkdirSync(WORK_DIR, { recursive: true });
    const draftPath = path.join(WORK_DIR, `candidate-${channel}.json`);
    writeFileSync(draftPath, JSON.stringify(draft, null, 2) + '\n', 'utf8');

    if (flags.register) {
        await consoleRequest('/api/admin/releases/candidates', {
            method: 'POST',
            slot: 'release_prepare',
            body: draft,
        });
    }

    console.log(JSON.stringify({
        ok: true,
        stage: 'candidate_prepared',
        registeredInConsole: Boolean(flags.register),
        draftFile: draftPath,
        candidate: draft,
    }, null, 2));
}

async function cmdUpload(flags) {
    const channel = String(flags.channel || 'testing');
    const draftPath = path.join(WORK_DIR, `candidate-${channel}.json`);
    if (!existsSync(draftPath)) {
        await cmdPrepare(flags);
    }
    const draft = JSON.parse(readFileSync(draftPath, 'utf8'));
    const apkPath = flags.apk ? path.resolve(flags.apk) : draft.apkLocalPath;
    if (!existsSync(apkPath)) throw new Error(`找不到待上传 APK: ${apkPath}`);

    const tag = String(flags.tag || draft.cnbTag || `candidate-${draft.versionName}-${draft.versionCode}`);
    const assetName = `tingyu-${draft.versionName}-release.apk`;

    // Check if tag release already exists on CNB; otherwise create as PRERELEASE (--make-latest false)
    let releaseObj = null;
    try {
        releaseObj = runCnbJson(['releases', 'get-release-by-tag', '--repo', CNB_REPO, '--tag', tag]);
    } catch {
        releaseObj = null;
    }

    if (!releaseObj?.id) {
        const notesFile = path.join(WORK_DIR, `notes-${channel}.md`);
        writeFileSync(notesFile, draft.releaseNotes, 'utf8');
        releaseObj = runCnbJson([
            'releases',
            'post-release',
            '--repo',
            CNB_REPO,
            '--tag-name',
            tag,
            '--name',
            `听屿 v${draft.versionName} (${channel === 'stable' ? '待审核候选' : '测试候选'})`,
            '--body-file',
            notesFile,
            '--prerelease',
            '--make-latest',
            'false',
        ]);
    }

    const uploadMeta = runCnbJson([
        'releases',
        'post-release-asset-upload-url',
        '--repo',
        CNB_REPO,
        '--release-id',
        String(releaseObj.id),
        '--asset-name',
        assetName,
        '--size',
        String(draft.apkSizeBytes),
        '--overwrite',
    ]);

    const uploadUrl = uploadMeta.upload_url;
    const verifyUrl = uploadMeta.verify_url || '';
    if (!uploadUrl) throw new Error('CNB 未返回附件 upload_url');

    const apkBytes = readFileSync(apkPath);
    const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/vnd.android.package-archive',
            'Content-Length': String(apkBytes.byteLength),
        },
        body: apkBytes,
    });
    if (!putRes.ok) {
        throw new Error(`上传 APK 二进制流至 CNB 失败: HTTP ${putRes.status}`);
    }

    // Extract upload_token & asset_path from verify_url if present
    if (verifyUrl) {
        const parsedVerify = new URL(verifyUrl, 'https://api.cnb.cool');
        const tokenParam = parsedVerify.searchParams.get('upload_token') || parsedVerify.searchParams.get('token') || '';
        const pathMatch = /\/releases\/asset-upload-confirmation\/([^?]+)$/.exec(parsedVerify.pathname);
        const assetPathParam = parsedVerify.searchParams.get('asset_path') || (pathMatch ? decodeURIComponent(pathMatch[1]) : '');
        if (tokenParam && assetPathParam) {
            runCnbJson([
                'releases',
                'post-release-asset-upload-confirmation',
                '--repo',
                CNB_REPO,
                '--release-id',
                String(releaseObj.id),
                '--upload-token',
                tokenParam,
                '--asset-path',
                assetPathParam,
            ]);
        }
    }

    const refreshed = runCnbJson(['releases', 'get-release-by-tag', '--repo', CNB_REPO, '--tag', tag]);
    const asset = (refreshed.assets || []).find(a => a.name === assetName);
    const cnbDownloadUrl = asset?.browser_download_url || `https://cnb.cool/${CNB_REPO}/-/releases/download/${tag}/${assetName}`;

    draft.cnbTag = tag;
    draft.cnbReleaseId = String(refreshed.id);
    draft.downloadUrls = [
        {
            id: 'cnb-primary',
            label: 'CNB 国内高速主节点',
            url: cnbDownloadUrl,
            priority: 1,
        },
        ...(draft.downloadUrls || []).filter(u => u.id !== 'cnb-primary'),
    ];
    writeFileSync(draftPath, JSON.stringify(draft, null, 2) + '\n', 'utf8');

    if (flags.register !== 'false') {
        await consoleRequest('/api/admin/releases/candidates', {
            method: 'POST',
            slot: 'release_prepare',
            body: draft,
        });
    }

    console.log(JSON.stringify({
        ok: true,
        stage: 'candidate_uploaded_prerelease_only',
        updateEnabledChanged: false,
        cnbTag: tag,
        cnbReleaseId: refreshed.id,
        cnbDownloadUrl,
    }, null, 2));
}

async function cmdVerify(flags) {
    const channel = String(flags.channel || 'testing');
    const draftPath = path.join(WORK_DIR, `candidate-${channel}.json`);

    // Allow standalone URL verification (`--url https://... --sha256 ... --size ...`) OR candidate verification
    if (flags.url) {
        const expectedSha = flags.sha256 ? String(flags.sha256).toLowerCase() : '';
        const expectedSize = flags.size ? Number(flags.size) : 0;
        const remote = await fullDownloadAndVerifyUrl(String(flags.url), expectedSha, expectedSize);
        if (!remote.accessible) {
            throw new Error(`远程安装包完整下载校验未通过: ${remote.detail}`);
        }
        console.log(JSON.stringify({ ok: true, mode: 'direct_url_verify', result: remote }, null, 2));
        return;
    }

    if (!existsSync(draftPath)) {
        throw new Error(`未找到候选记录 ${draftPath}，请先执行 prepare 或传入 --url`);
    }
    const draft = JSON.parse(readFileSync(draftPath, 'utf8'));
    const localCheck = existsSync(draft.apkLocalPath) ? inspectLocalApk(draft.apkLocalPath) : null;

    const nodes = {};
    for (const mirror of draft.downloadUrls || []) {
        const check = await fullDownloadAndVerifyUrl(mirror.url, draft.sha256, draft.apkSizeBytes);
        nodes[mirror.id] = check;
        if (!check.accessible) {
            throw new Error(`下载节点 [${mirror.label}] 校验失败: ${check.detail}`);
        }
    }

    draft.verification = {
        verifiedAt: new Date().toISOString(),
        localApkOk: Boolean(localCheck),
        nodes,
    };
    writeFileSync(draftPath, JSON.stringify(draft, null, 2) + '\n', 'utf8');

    if (flags.register !== 'false' && (draft.downloadUrls || []).length > 0) {
        await consoleRequest('/api/admin/releases/candidates', {
            method: 'POST',
            slot: 'release_prepare',
            body: draft,
        });
    }

    console.log(JSON.stringify({
        ok: true,
        stage: 'candidate_verified',
        versionName: draft.versionName,
        versionCode: draft.versionCode,
        sha256: draft.sha256,
        nodes,
    }, null, 2));
}

async function cmdInitCnbManifests() {
    // 安全初始化 CNB 正式与测试静态更新配置：默认全部 updateEnabled: false，绝不触发线上更新！
    const k1 = readDpapiSlot('policy_signing_k1');
    const trusted = loadTrustedPublicKeys();
    const pkg = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
    const now = Date.now();
    const expiresAtMs = now + 30 * 86400_000;

    const makeDisabledManifest = async (channel) => {
        const unsigned = {
            schemaVersion: 1,
            appId: TINGYU_APP_ID,
            channel,
            policyRevision: 1,
            policyAction: 'pause',
            updateEnabled: false,
            latestVersionName: pkg.version,
            latestVersionCode: pkg.androidVersionCode,
            minSupportedVersionCode: 1,
            releaseId: `init-${channel}-disabled`,
            gitCommit: collectRecentGitNotes().gitCommit,
            releaseNotes: '听屿软件内更新通道已就绪（当前未启用新版本推送）。',
            publishedAt: new Date(now).toISOString(),
            publishedAtEpochMs: now,
            policyExpiresAt: new Date(expiresAtMs).toISOString(),
            policyExpiresAtEpochMs: expiresAtMs,
            offlineGraceHours: DEFAULT_OFFLINE_GRACE_HOURS,
            apkSizeBytes: 0,
            sha256: '0'.repeat(64),
            apkCertSha256: EXPECTED_CERT_SHA256,
            minSdk: 24,
            supportedAbis: ['arm64-v8a', 'armeabi-v7a'],
            downloadUrls: [],
        };
        const signed = await signUpdateManifest(unsigned, k1.privateKeyJwk, k1.keyId);
        const check = await verifyUpdateManifest(signed, trusted);
        if (!check.ok) throw new Error(`自检签名失败: ${check.error}`);
        return signed;
    };

    const stableSigned = await makeDisabledManifest('stable');
    const testingSigned = await makeDisabledManifest('testing');
    const stableJson = JSON.stringify(stableSigned, null, 2);
    const testingJson = JSON.stringify(testingSigned, null, 2);

    const gitPush = pushStaticManifestsToCnbGit(
        {
            'stable.json': stableJson,
            'channels/testing.json': testingJson,
        },
        'chore(update): initialize signed update manifests with updateEnabled=false',
    );

    const localMirrorDir = path.join(PROJECT_ROOT, 'releases', 'update-manifests');
    mkdirSync(localMirrorDir, { recursive: true });
    writeFileSync(path.join(localMirrorDir, 'stable.json'), stableJson + '\n', 'utf8');
    writeFileSync(path.join(localMirrorDir, 'testing.json'), testingJson + '\n', 'utf8');

    console.log(JSON.stringify({
        ok: true,
        cnbPushed: gitPush.changed,
        stableUrl: `${CNB_RAW_BASE}/stable.json`,
        testingUrl: `${CNB_RAW_BASE}/channels/testing.json`,
        stableUpdateEnabled: stableSigned.updateEnabled,
        testingUpdateEnabled: testingSigned.updateEnabled,
    }, null, 2));
}

async function cmdSyncManifests(flags) {
    const trusted = loadTrustedPublicKeys();
    const channels = flags.channel ? [String(flags.channel)] : ['stable', 'testing'];
    const filesToPush = {};
    const syncedChannels = [];

    for (const ch of channels) {
        const res = await fetch(`${CONSOLE_API_BASE}/api/public/update/${ch}`);
        if (res.status === 404) continue;
        if (!res.ok) throw new Error(`获取云端 [${ch}] 签名策略失败: HTTP ${res.status}`);
        const manifest = await res.json();
        const verified = await verifyUpdateManifest(manifest, trusted);
        if (!verified.ok) {
            throw new Error(`拒绝同步 [${ch}]：云端返回策略未通过本地公钥验签 (${verified.error})`);
        }
        const formatted = JSON.stringify(manifest, null, 2);
        const relPath = ch === 'stable' ? 'stable.json' : `channels/${ch}.json`;
        filesToPush[relPath] = formatted;

        const localMirrorDir = path.join(PROJECT_ROOT, 'releases', 'update-manifests');
        mkdirSync(localMirrorDir, { recursive: true });
        writeFileSync(path.join(localMirrorDir, `${ch}.json`), formatted + '\n', 'utf8');
        syncedChannels.push({ channel: ch, policyRevision: manifest.policyRevision, updateEnabled: manifest.updateEnabled });
    }

    if (Object.keys(filesToPush).length === 0) {
        console.log(JSON.stringify({ ok: true, synced: [], note: '云端尚无已签发策略记录' }, null, 2));
        return;
    }

    const pushRes = pushStaticManifestsToCnbGit(
        filesToPush,
        `chore(update): mirror signed update policies (${syncedChannels.map(s => `${s.channel}#${s.policyRevision}`).join(', ')})`,
    );

    for (const item of syncedChannels) {
        const cnbUrl = item.channel === 'stable' ? `${CNB_RAW_BASE}/stable.json` : `${CNB_RAW_BASE}/channels/${item.channel}.json`;
        await consoleRequest('/api/admin/policy/sync-report', {
            method: 'POST',
            slot: 'release_prepare',
            body: { channel: item.channel, cnbSynced: true, cnbUrl },
        });
    }

    console.log(JSON.stringify({ ok: true, cnbPushed: pushRes.changed, syncedChannels }, null, 2));
}

async function cmdPublish(flags) {
    if (!flags.confirm) {
        throw new Error('安全拦截：正式发布必须由管理员显式传入 --confirm 参数确认！');
    }
    const id = String(flags.id || '');
    if (!id) throw new Error('请通过 --id <releaseId> 指定已审核通过的候选版本 ID');

    const publishSecret = readDpapiSlot('release_publish').token;
    const list = await consoleRequest('/api/admin/releases', { slot: 'admin' });
    const target = (list.items || []).find(r => r.id === id);
    if (!target) throw new Error(`未找到候选版本: ${id}`);
    if (target.status !== 'approved' || !target.approved_digest) {
        throw new Error(`候选版本 ${id} 当前状态为 ${target.status}，请先在后台审核确认！`);
    }

    const pub = await consoleRequest(`/api/admin/releases/${id}/publish`, {
        method: 'POST',
        slot: 'admin',
        extraHeaders: { 'X-Publish-Secret': publishSecret },
        body: {
            confirmNonce: randomBytes(18).toString('hex'),
            expectedDigest: target.approved_digest,
            expectedSha256: target.sha256,
        },
    });

    if (flags['skip-static-sync'] !== 'true') {
        await cmdSyncManifests({ channel: target.channel });
    }
    console.log(JSON.stringify({ ok: true, published: id, policyRevision: pub.policyRevision }, null, 2));
}

async function cmdPolicyAction(mode, flags) {
    if (!flags.confirm) {
        throw new Error(`安全拦截：执行 ${mode} 必须显式传入 --confirm 参数确认！`);
    }
    const channel = String(flags.channel || 'testing');
    const publishSecret = readDpapiSlot('release_publish').token;
    const res = await consoleRequest(`/api/admin/policy/${channel}/${mode}`, {
        method: 'POST',
        slot: 'admin',
        extraHeaders: { 'X-Publish-Secret': publishSecret },
        body: {
            confirmNonce: randomBytes(18).toString('hex'),
            safeMinVersionCode: 1,
            reason: String(flags.reason || `CLI 管理员执行 ${mode}`),
        },
    });
    if (flags['skip-static-sync'] !== 'true') {
        await cmdSyncManifests({ channel });
    }
    console.log(JSON.stringify({ ok: true, mode, channel, policyRevision: res.policyRevision, manifest: res.manifest }, null, 2));
}

async function cmdStatus() {
    const overview = await consoleRequest('/api/admin/overview', { slot: 'read' });
    console.log(JSON.stringify({
        ok: true,
        serviceHealth: overview.serviceHealth,
        feedbackStats: {
            totalActive: overview.feedbackStats.total,
            pendingFeedback: overview.feedbackStats.pendingFeedback,
            highPriority: overview.feedbackStats.highPriority,
        },
        policies: overview.policies?.map(p => ({
            channel: p.channel,
            policyRevision: p.policyRevision,
            policyAction: p.policyAction,
            updateEnabled: p.updateEnabled,
            latestVersion: `${p.latestVersionName} (${p.latestVersionCode})`,
            minSupportedVersionCode: p.minSupportedVersionCode,
            nodeSync: p.nodeSync,
        })),
        stableRelease: overview.stableRelease ? `${overview.stableRelease.version_name} (${overview.stableRelease.version_code})` : null,
        candidateRelease: overview.candidateRelease ? `${overview.candidateRelease.id} [${overview.candidateRelease.status}]` : null,
        testingCandidate: overview.testingCandidate ? `${overview.testingCandidate.id} [${overview.testingCandidate.status}]` : null,
    }, null, 2));
}

async function cmdHistory(flags) {
    const ch = flags.channel ? `&channel=${encodeURIComponent(String(flags.channel))}` : '';
    const audits = await consoleRequest(`/api/admin/audit?limit=30${ch}`, { slot: 'read' });
    console.log(JSON.stringify({ ok: true, count: audits.items?.length || 0, items: audits.items }, null, 2));
}

function printHelp() {
    console.log(`听屿统一发布与验证 CLI (tools/release-cli.mjs)

用法：
  node tools/release-cli.mjs <command> [options]

命令列表：
  build                          仅本地构建签名 Release APK（不升版本号、不上传、不改线上策略）
  prepare [--channel testing]    校验本地 APK 签名/包名/ABI/SHA256 并生成候选草稿（加 --register 写入后台待审池）
  upload  [--channel testing]    上传候选 APK 至 CNB 预发布附件（--prerelease，不触发正式更新）
  verify  [--channel testing]    从远程下载直链完整拉取二进制 APK 并校验字节长度与完整 SHA-256
  init-cnb-manifests             初始化 CNB 仓库签名版 stable.json 与 channels/testing.json（默认 updateEnabled=false）
  sync-manifests [--channel ..]  将云端已验签策略镜像同步至 CNB 静态分支与本地仓库备份目录
  publish --id <id> --confirm    [需管理员确认] 发布已审核绑定的候选版本并同步多节点策略
  pause   --channel <ch> --confirm [需管理员确认] 暂停指定渠道新版本更新推送
  unlock  --channel <ch> --confirm [需管理员确认] 紧急解除指定渠道强制更新拦截（降低最低版本并递增策略号）
  status                         只读查看线上服务健康度、各渠道更新策略与候选版本状态
  history [--channel <ch>]       只读查看防篡改哈希链发布审计记录
`);
}

async function main() {
    const { command, flags } = parseArgs(process.argv.slice(2));
    switch (command) {
        case 'build': await cmdBuild(); break;
        case 'prepare': await cmdPrepare(flags); break;
        case 'upload': await cmdUpload(flags); break;
        case 'verify': await cmdVerify(flags); break;
        case 'init-cnb-manifests': await cmdInitCnbManifests(); break;
        case 'sync-manifests': await cmdSyncManifests(flags); break;
        case 'publish': await cmdPublish(flags); break;
        case 'pause': await cmdPolicyAction('pause', flags); break;
        case 'unlock': await cmdPolicyAction('unlock', flags); break;
        case 'status': await cmdStatus(); break;
        case 'history': await cmdHistory(flags); break;
        default: printHelp(); break;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(err => {
        console.error(`✖ [release-cli] ${err.message || err}`);
        process.exit(1);
    });
}
