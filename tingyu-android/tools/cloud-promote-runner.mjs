#!/usr/bin/env node
// tools/cloud-promote-runner.mjs
// 云端受控转正执行器（运行于 GitHub Actions，流式处理 APK、双源上传、完整回验、策略签发回调与静态镜像同步）。
// 安全边界：
// 1. 仅通过环境变量读取 PROMOTE_RUNNER_SECRET、CNB_TOKEN、GITHUB_TOKEN，绝不打印或写入文件。
// 2. 正式策略签名私钥与 RELEASE_PUBLISH_SECRET 始终留在 Cloudflare Worker，本脚本不接触任何签名私钥。

import { createHash } from 'node:crypto';
import {
    createReadStream,
    createWriteStream,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const CONSOLE_API_BASE = (process.env.TINGYU_CONSOLE_API_BASE || 'https://feedback.20262000.xyz').replace(/\/+$/, '');
const RUNNER_SECRET = process.env.PROMOTE_RUNNER_SECRET || '';
const CNB_TOKEN = process.env.CNB_TOKEN || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const CNB_REPO = process.env.CNB_REPO || 'tingyu-2026/releases';
const GITHUB_REPO = process.env.GITHUB_REPO || 'huleixin/folia-rear-lyrics';
const JOB_ID = process.env.PROMOTE_JOB_ID || '';
const RUN_MODE = process.env.PROMOTE_MODE || 'promote';
const RUNNER_RUN_URL = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : '';

function assertEnv() {
    if (!JOB_ID) throw new Error('PROMOTE_JOB_ID_REQUIRED');
    if (!RUNNER_SECRET) throw new Error('PROMOTE_RUNNER_SECRET_REQUIRED');
    if (!CNB_TOKEN) throw new Error('CNB_TOKEN_REQUIRED');
    if (RUN_MODE === 'promote' && !GITHUB_TOKEN) throw new Error('GITHUB_TOKEN_REQUIRED');
}

async function runnerApi(pathname, body) {
    const res = await fetch(`${CONSOLE_API_BASE}/api/promote/runner/jobs/${encodeURIComponent(JOB_ID)}${pathname}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${RUNNER_SECRET}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Tingyu-CloudPromoteRunner/1.0',
        },
        body: JSON.stringify(body || {}),
    });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
    if (!res.ok) {
        throw new Error(`Worker ${pathname} HTTP ${res.status}: ${data.error || text.slice(0, 200)}`);
    }
    return data;
}

async function reportProgress(step, message) {
    await runnerApi('/progress', { step, message });
}

async function sha256FileStream(filePath) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filePath)) {
        hash.update(chunk);
    }
    return hash.digest('hex');
}

function findAndroidBuildToolsDir() {
    const sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
    if (!sdkDir || !existsSync(path.join(sdkDir, 'build-tools'))) {
        throw new Error('ANDROID_HOME/build-tools 未就绪');
    }
    const versions = readdirSync(path.join(sdkDir, 'build-tools')).sort();
    if (!versions.length) throw new Error('Android build-tools 目录为空');
    return path.join(sdkDir, 'build-tools', versions[versions.length - 1]);
}

function verifyApkWithBuildTools(apkPath, expectedAppId, expectedCertSha256) {
    const btDir = findAndroidBuildToolsDir();
    const isWin = process.platform === 'win32';
    const apksignerJar = path.join(btDir, 'lib', 'apksigner.jar');
    const apksignerBin = path.join(btDir, isWin ? 'apksigner.bat' : 'apksigner');
    const aapt2Bin = path.join(btDir, isWin ? 'aapt2.exe' : 'aapt2');

    const sigRes = existsSync(apksignerJar)
        ? spawnSync('java', ['-jar', apksignerJar, 'verify', '--print-certs', apkPath], { encoding: 'utf8' })
        : spawnSync(apksignerBin, ['verify', '--print-certs', apkPath], { encoding: 'utf8', shell: isWin });
    if (sigRes.status !== 0) {
        throw new Error(`apksigner 校验失败: ${(sigRes.stderr || sigRes.stdout).slice(0, 240)}`);
    }
    // Build-tools 37 labels certificates by signing scheme, e.g. V3.0 Signer.
    const certDigests = [...(sigRes.stdout || '').matchAll(
        /^(?:Signer #[1-9]\d*|V\d[\d.]* Signer(?::| #[1-9]\d*:?)) certificate SHA-256 digest:\s*([a-fA-F0-9]{64})\s*$/gm,
    )].map(match => match[1].toLowerCase());
    if (!certDigests.length) throw new Error('无法读取 APK 签名证书摘要');
    if (certDigests.some(digest => digest !== expectedCertSha256.toLowerCase())) {
        throw new Error(`APK 签名证书不匹配: ${certDigests.join(', ')}`);
    }
    const certSha256 = certDigests[0];

    const badgeRes = spawnSync(aapt2Bin, ['dump', 'badging', apkPath], { encoding: 'utf8' });
    if (badgeRes.status !== 0) {
        throw new Error(`aapt2 解析失败: ${(badgeRes.stderr || badgeRes.stdout).slice(0, 240)}`);
    }
    const pkgMatch = /package:\s+name='([^']+)'\s+versionCode='(\d+)'\s+versionName='([^']+)'/.exec(badgeRes.stdout || '');
    if (!pkgMatch) throw new Error('无法从 APK 读取包名与版本');
    const [, packageName, vCodeStr, versionName] = pkgMatch;
    if (packageName !== expectedAppId) {
        throw new Error(`APK 包名不匹配: ${packageName}`);
    }
    return {
        packageName,
        versionName,
        versionCode: Number(vCodeStr),
        certSha256,
    };
}

async function downloadStreamToFile(url, destPath, headers = {}) {
    const started = Date.now();
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Tingyu-CloudPromoteRunner/1.0', ...headers },
        redirect: 'follow',
    });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok) {
        throw new Error(`下载失败 HTTP ${res.status} (${url})`);
    }
    if (contentType.includes('text/html')) {
        throw new Error(`下载返回 HTML 页面而非二进制 APK (${url})`);
    }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
    const sizeBytes = statSync(destPath).size;
    const sha256 = await sha256FileStream(destPath);
    return {
        httpStatus: res.status,
        sizeBytes,
        sha256,
        latencyMs: Date.now() - started,
    };
}

async function cnbApi(pathname, { method = 'GET', body } = {}) {
    const headers = {
        Authorization: `Bearer ${CNB_TOKEN}`,
        Accept: 'application/json',
        'User-Agent': 'Tingyu-CloudPromoteRunner/1.0',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`https://api.cnb.cool/${CNB_REPO}/-/releases${pathname}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
    return { ok: res.ok, status: res.status, data };
}

async function uploadToCnbRelease({ tag, title, body, apkPath, assetName, sizeBytes }) {
    let relRes = await cnbApi(`/tags/${encodeURIComponent(tag)}`);
    let release = relRes.ok ? relRes.data : null;
    if (!release?.id) {
        const created = await cnbApi('', {
            method: 'POST',
            body: {
                tag_name: tag,
                target_commitish: 'main',
                name: title,
                body,
                prerelease: false,
                make_latest: 'true',
            },
        });
        if (!created.ok || !created.data?.id) {
            throw new Error(`创建 CNB Release 失败 (HTTP ${created.status}): ${JSON.stringify(created.data).slice(0, 200)}`);
        }
        release = created.data;
    }

    const upMetaRes = await cnbApi(`/${encodeURIComponent(String(release.id))}/asset-upload-url`, {
        method: 'POST',
        body: { asset_name: assetName, size: sizeBytes, overwrite: true },
    });
    if (!upMetaRes.ok || !upMetaRes.data?.upload_url) {
        throw new Error(`获取 CNB 上传地址失败 (HTTP ${upMetaRes.status})`);
    }

    const putRes = await fetch(upMetaRes.data.upload_url, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/vnd.android.package-archive',
            'Content-Length': String(sizeBytes),
        },
        body: Readable.toWeb(createReadStream(apkPath)),
        duplex: 'half',
    });
    if (!putRes.ok) {
        throw new Error(`流式上传 APK 至 CNB 失败 (HTTP ${putRes.status})`);
    }

    if (upMetaRes.data.verify_url) {
        const parsedVerify = new URL(upMetaRes.data.verify_url, 'https://api.cnb.cool');
        const segMatch = /\/asset-upload-confirmation\/([^/]+)\/(.+)$/.exec(parsedVerify.pathname);
        const uploadToken = parsedVerify.searchParams.get('upload_token')
            || parsedVerify.searchParams.get('token')
            || (segMatch ? decodeURIComponent(segMatch[1]) : '');
        const assetPath = parsedVerify.searchParams.get('asset_path')
            || (segMatch ? decodeURIComponent(segMatch[2]) : '');
        if (!uploadToken || !assetPath) {
            throw new Error(`无法解析 CNB 确认参数: ${parsedVerify.pathname}`);
        }
        const confRes = await cnbApi(`/${encodeURIComponent(String(release.id))}/asset-upload-confirmation/${encodeURIComponent(uploadToken)}/${assetPath}`, {
            method: 'POST',
        });
        if (!confRes.ok) {
            throw new Error(`确认 CNB 附件失败 (HTTP ${confRes.status})`);
        }
    }

    const refreshed = await cnbApi(`/tags/${encodeURIComponent(tag)}`);
    const asset = (refreshed.data?.assets || []).find(a => a.name === assetName);
    const downloadUrl = asset?.browser_download_url || `https://cnb.cool/${CNB_REPO}/-/releases/download/${tag}/${assetName}`;
    return {
        cnbReleaseId: String(release.id),
        downloadUrl,
    };
}

async function uploadToGitHubRelease({ tag, title, body, apkPath, assetName, sizeBytes }) {
    const ghHeaders = {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Tingyu-CloudPromoteRunner/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    let release = null;
    const getRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${encodeURIComponent(tag)}`, {
        headers: ghHeaders,
    });
    if (getRes.ok) {
        release = await getRes.json();
        const patchRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/${release.id}`, {
            method: 'PATCH',
            headers: { ...ghHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: title, body, prerelease: false, draft: false, make_latest: 'true' }),
        });
        if (patchRes.ok) release = await patchRes.json();
    } else if (getRes.status === 404) {
        const createRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases`, {
            method: 'POST',
            headers: { ...ghHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tag_name: tag,
                target_commitish: 'main',
                name: title,
                body,
                draft: false,
                prerelease: false,
                make_latest: 'true',
            }),
        });
        if (!createRes.ok) {
            throw new Error(`创建 GitHub Release 失败 (HTTP ${createRes.status})`);
        }
        release = await createRes.json();
    } else {
        throw new Error(`查询 GitHub Release 失败 (HTTP ${getRes.status})`);
    }

    const existingAsset = (release.assets || []).find(a => a.name === assetName);
    if (existingAsset?.id) {
        await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/assets/${existingAsset.id}`, {
            method: 'DELETE',
            headers: ghHeaders,
        });
    }

    const uploadEndpoint = String(release.upload_url || '').replace(/\{\?name,label\}$/, '') + `?name=${encodeURIComponent(assetName)}`;
    const upRes = await fetch(uploadEndpoint, {
        method: 'POST',
        headers: {
            ...ghHeaders,
            'Content-Type': 'application/vnd.android.package-archive',
            'Content-Length': String(sizeBytes),
        },
        body: Readable.toWeb(createReadStream(apkPath)),
        duplex: 'half',
    });
    if (!upRes.ok) {
        throw new Error(`流式上传 GitHub Release 资产失败 (HTTP ${upRes.status})`);
    }
    const uploadedAsset = await upRes.json();
    return {
        downloadUrl: uploadedAsset.browser_download_url,
    };
}

function pushStaticManifestsToCnb({ stableManifest, testingManifest }) {
    const tmpRepo = mkdtempSync(path.join(tmpdir(), 'tingyu-cnb-static-'));
    try {
        const authUrl = `https://cnb:${CNB_TOKEN}@cnb.cool/${CNB_REPO}.git`;
        const clone = spawnSync('git', ['clone', '--depth', '1', authUrl, tmpRepo], { encoding: 'utf8' });
        if (clone.status !== 0) {
            throw new Error('克隆 CNB 静态发布仓库失败');
        }
        spawnSync('git', ['config', 'user.name', 'Tingyu Cloud Release Bot'], { cwd: tmpRepo });
        spawnSync('git', ['config', 'user.email', 'tingyu-release@noreply.cnb.cool'], { cwd: tmpRepo });

        if (stableManifest) {
            writeFileSync(path.join(tmpRepo, 'stable.json'), JSON.stringify(stableManifest, null, 2) + '\n', 'utf8');
        }
        if (testingManifest) {
            const tStr = JSON.stringify(testingManifest, null, 2) + '\n';
            writeFileSync(path.join(tmpRepo, 'testing.json'), tStr, 'utf8');
            mkdirSync(path.join(tmpRepo, 'channels'), { recursive: true });
            writeFileSync(path.join(tmpRepo, 'channels', 'testing.json'), tStr, 'utf8');
        }

        spawnSync('git', ['add', '.'], { cwd: tmpRepo });
        const diff = spawnSync('git', ['status', '--porcelain'], { cwd: tmpRepo, encoding: 'utf8' });
        if ((diff.stdout || '').trim()) {
            const rev = stableManifest?.policyRevision || testingManifest?.policyRevision || 0;
            const commit = spawnSync('git', ['commit', '-m', `chore(update): cloud promote stable#${rev}`], { cwd: tmpRepo, encoding: 'utf8' });
            if (commit.status !== 0) throw new Error('提交静态策略文件失败');
            const push = spawnSync('git', ['push', 'origin', 'main'], { cwd: tmpRepo, encoding: 'utf8' });
            if (push.status !== 0) throw new Error('推送静态策略至 CNB 失败');
        }
        return true;
    } finally {
        try { rmSync(tmpRepo, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

async function main() {
    assertEnv();
    let currentStep = 'verifying_apk';
    const workDir = mkdtempSync(path.join(tmpdir(), 'tingyu-promote-'));
    try {
        const claim = await runnerApi('/claim', { mode: RUN_MODE, runnerRunUrl: RUNNER_RUN_URL });
        const job = claim.job;

        if (claim.mode === 'sync_only') {
            currentStep = 'syncing_static';
            try {
                pushStaticManifestsToCnb({
                    stableManifest: claim.stableManifest,
                    testingManifest: claim.testingManifest,
                });
                await runnerApi('/sync-result', {
                    cnbSynced: true,
                    cnbUrl: `https://cnb.cool/${CNB_REPO}/-/git/raw/main/stable.json`,
                });
            } catch (syncErr) {
                await runnerApi('/sync-result', {
                    cnbSynced: false,
                    errorMessage: syncErr.message || 'cnb_static_sync_failed',
                });
                throw syncErr;
            }
            return;
        }

        // 1. 拉取受保护 R2 源 APK 并校验
        const sourceApkPath = path.join(workDir, `source-${job.versionCode}.apk`);
        const dl = await downloadStreamToFile(claim.apkDownloadUrl, sourceApkPath);
        if (dl.sizeBytes !== job.apkSizeBytes || dl.sha256 !== job.apkSha256) {
            throw new Error(`源 APK 摘要或大小不一致: size=${dl.sizeBytes}/${job.apkSizeBytes}, sha=${dl.sha256}`);
        }
        const apkMeta = verifyApkWithBuildTools(sourceApkPath, claim.expectedAppId, claim.expectedCertSha256);
        if (apkMeta.versionName !== job.versionName || apkMeta.versionCode !== job.versionCode) {
            throw new Error(`APK 版本元信息不一致: ${apkMeta.versionName}(${apkMeta.versionCode})`);
        }

        const tag = job.cnbTag || `v${job.versionName}`;
        const assetName = `tingyu-${job.versionName}-release.apk`;
        const releaseTitle = `听屿 v${job.versionName}`;

        // 2. 上传至 CNB 正式发布节点
        currentStep = 'uploading_cnb';
        await reportProgress('uploading_cnb', `正在将 APK 上传至 CNB 正式节点 (${tag})`);
        const cnbRes = await uploadToCnbRelease({
            tag,
            title: releaseTitle,
            body: job.releaseNotes,
            apkPath: sourceApkPath,
            assetName,
            sizeBytes: job.apkSizeBytes,
        });

        // 3. 上传至 GitHub 正式备用节点
        currentStep = 'uploading_github';
        await reportProgress('uploading_github', `正在将 APK 上传至 GitHub 正式备用节点 (${tag})`);
        const ghRes = await uploadToGitHubRelease({
            tag,
            title: releaseTitle,
            body: job.releaseNotes,
            apkPath: sourceApkPath,
            assetName,
            sizeBytes: job.apkSizeBytes,
        });

        // 4. 对双公开节点进行完整文件回验与签名校验
        currentStep = 'verifying_nodes';
        await reportProgress('verifying_nodes', '正在对 CNB 与 GitHub 下载节点执行完整文件回验与签名校验');
        const cnbVerifyPath = path.join(workDir, 'verify-cnb.apk');
        const ghVerifyPath = path.join(workDir, 'verify-gh.apk');
        const cnbCheck = await downloadStreamToFile(cnbRes.downloadUrl, cnbVerifyPath);
        if (cnbCheck.sizeBytes !== job.apkSizeBytes || cnbCheck.sha256 !== job.apkSha256) {
            throw new Error(`CNB 节点回验摘要不一致: ${cnbCheck.sha256}`);
        }
        const cnbSig = verifyApkWithBuildTools(cnbVerifyPath, claim.expectedAppId, claim.expectedCertSha256);

        const ghCheck = await downloadStreamToFile(ghRes.downloadUrl, ghVerifyPath);
        if (ghCheck.sizeBytes !== job.apkSizeBytes || ghCheck.sha256 !== job.apkSha256) {
            throw new Error(`GitHub 节点回验摘要不一致: ${ghCheck.sha256}`);
        }
        const ghSig = verifyApkWithBuildTools(ghVerifyPath, claim.expectedAppId, claim.expectedCertSha256);

        // 5. 回调 Worker 签发正式更新策略
        currentStep = 'publishing_policy';
        await reportProgress('publishing_policy', '双节点回验通过，正在签发 stable 正式更新策略');
        const downloadUrls = [
            { id: 'cnb-primary', label: 'CNB 国内高速主节点', url: cnbRes.downloadUrl, priority: 1 },
            { id: 'github-backup', label: 'GitHub 备用节点', url: ghRes.downloadUrl, priority: 2 },
        ];
        const finRes = await runnerApi('/finalize', {
            cnbTag: tag,
            cnbReleaseId: cnbRes.cnbReleaseId,
            downloadUrls,
            nodeVerifications: {
                'cnb-primary': {
                    accessible: true,
                    sizeBytes: cnbCheck.sizeBytes,
                    sha256: cnbCheck.sha256,
                    certSha256: cnbSig.certSha256,
                    latencyMs: cnbCheck.latencyMs,
                },
                'github-backup': {
                    accessible: true,
                    sizeBytes: ghCheck.sizeBytes,
                    sha256: ghCheck.sha256,
                    certSha256: ghSig.certSha256,
                    latencyMs: ghCheck.latencyMs,
                },
            },
        });

        // 6. 同步静态更新策略到 CNB 仓库
        currentStep = 'syncing_static';
        try {
            pushStaticManifestsToCnb({
                stableManifest: finRes.stableManifest,
                testingManifest: finRes.testingManifest,
            });
            await runnerApi('/sync-result', {
                cnbSynced: true,
                cnbUrl: `https://cnb.cool/${CNB_REPO}/-/git/raw/main/stable.json`,
            });
        } catch (syncErr) {
            await runnerApi('/sync-result', {
                cnbSynced: false,
                errorMessage: syncErr.message || 'cnb_static_sync_failed',
            });
            throw syncErr;
        }
    } catch (err) {
        try {
            await runnerApi('/fail', {
                step: currentStep,
                errorCode: 'cloud_promote_runner_error',
                errorMessage: err?.message || '未知云端执行错误',
            });
        } catch { /* ignore */ }
        throw err;
    } finally {
        try { rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

main().catch(err => {
    console.error(`[cloud-promote-runner] ${err?.message || err}`);
    process.exit(1);
});
