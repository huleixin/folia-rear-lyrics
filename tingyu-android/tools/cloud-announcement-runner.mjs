import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const consoleOrigin = 'https://feedback.20262000.xyz';
const repository = 'https://cnb.cool/tingyu-2026/releases.git';
const rawOrigin = 'https://cnb.cool/tingyu-2026/releases/-/git/raw/main/';
const secret = process.env.PROMOTE_RUNNER_SECRET;
const token = (process.env.ANNOUNCEMENT_CNB_TOKEN || process.env.CNB_TOKEN)?.trim();
if (!secret || !token) throw Error('公告同步凭据未配置');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pathAllowed = /^(?:announcements\/public\.json|announcements\/images\/[a-f0-9]{24}\.(?:png|jpg|webp)|beta-vault\/(?:announcement-envelopes\/[a-f0-9]{64}\.json|announcement-images\/private-[a-f0-9-]{36}\.(?:png|jpg|webp)\.enc))$/;
const gitEnv = {
    ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://cnb.cool/.extraHeader',
    GIT_CONFIG_VALUE_0: 'Authorization: Basic ' + Buffer.from('cnb:' + token).toString('base64'),
};

function git(cwd, ...args) {
    return execFileSync('git', args, { cwd, env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
}
async function api(path, data) {
    return fetch(consoleOrigin + '/api/announcements/runner/' + path, {
        method: data ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
        body: data ? JSON.stringify(data) : undefined,
    });
}

const response = await api('bundle');
if (!response.ok) throw Error('读取待同步公告失败 HTTP ' + response.status);
const bundle = await response.json();
const files = new Map();
const root = mkdtempSync(join(tmpdir(), 'tingyu-announcements-'));
let pushed = false;
let failureCode;

try {
    for (const [path, value] of Object.entries(bundle.files)) {
        files.set(path, Buffer.from(JSON.stringify(value, null, 2) + '\n'));
    }
    for (const image of bundle.images) {
        if (!pathAllowed.test(image.path) || !/^[a-zA-Z0-9._-]{4,80}$/.test(image.filename)) throw Error('公告图片路径无效');
        const response = await api('image/' + encodeURIComponent(image.filename));
        if (!response.ok) throw Error('读取公告图片失败 HTTP ' + response.status);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (sha(bytes) !== image.hash) throw Error('公告图片摘要不一致');
        files.set(image.path, bytes);
    }
    if (files.size) {
        git(root, 'clone', '--depth=1', '--branch', 'main', repository, '.');
        for (const [path, bytes] of files) {
            if (!pathAllowed.test(path)) throw Error('公告文件路径无效');
            const file = join(root, path);
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, bytes);
        }
        git(root, 'add', '--', ...files.keys());
        if (git(root, 'diff', '--cached', '--name-only').length) {
            git(root, '-c', 'user.name=Tingyu Announcement Sync', '-c', 'user.email=announcements@noreply.cnb.cool',
                'commit', '-m', 'chore(announcements): sync signed feeds');
            git(root, 'push', 'origin', 'HEAD:main');
        }
        for (const [path, bytes] of files) {
            let matched = false;
            const hash = sha(bytes);
            for (let attempt = 0; attempt < 4 && !matched; attempt++) {
                const res = await fetch(rawOrigin + path + '?verify=' + hash.slice(0, 16),
                    { signal: AbortSignal.timeout(15000) }).catch(() => null);
                matched = res?.ok && sha(Buffer.from(await res.arrayBuffer())) === hash;
                if (!matched) await new Promise(resolve => setTimeout(resolve, 1500));
            }
            if (!matched) throw Error('CNB 未返回刚提交的公告文件');
        }
    }
    pushed = true;
} catch (error) {
    if (/repository not found|authentication failed|401|403|permission denied/i.test(String(error.stderr || ''))) {
        failureCode = 'cnb_repository_auth';
        throw Error('Cloud runner does not have access to the CNB release repository');
    }
    throw Error('CNB announcement synchronization failed: ' + (error.stderr ? 'git operation failed' : error.message));
} finally {
    rmSync(root, { recursive: true, force: true });
    for (const [channel, feedRevision] of Object.entries(bundle.revisions)) {
        const ok = pushed && !(channel === 'private_beta' && bundle.missingEncryptionKey);
        const result = await api('report', {
            ok, channel, feedRevision, error: ok ? undefined : failureCode,
            syncedImageFilenames: ok ? bundle.images.filter(x => x.channel === 'public').map(x => x.filename) : [],
        });
        if (!result.ok && result.status !== 409) throw Error('回报 CNB 同步状态失败 HTTP ' + result.status);
    }
}
if (!pushed || bundle.missingEncryptionKey) throw Error('部分公告无法完成 CNB 同步');
console.log('CNB announcement files verified:', files.size);
