#!/usr/bin/env node
/**
 * 反馈面板修复的「资产新鲜度」守门员（68743 二次事故）。
 *
 * 背景：第一轮修复只改了 FeedbackPanel.tsx / nativeSettingsDocument.ts，但交付的
 * 1.3.181 APK 里打包的仍是 01:47 的旧 FeedbackPanel chunk（遮罩还是全屏 <button>）。
 * 原因是 cap:sync:android 在 stash-dirs 步骤因 Windows 目录占用报 EPERM，&& 链断在
 * cap sync 之前，而后续 assembleRelease 照旧把旧 public 打进了包 —— 源码里的修复
 * 从未到达设备，用户「装了修复版却仍然点哪都返回」。
 *
 * 因此：编译通过、单测通过都不等于修复已交付。这里直接比对 dist 与 Android 资产，
 * 并断言产物里的遮罩语义，任何一条不满足都非零退出，把构建链当场掐断。
 *
 * 用法: node dev/build/verifyFeedbackOverlay.mjs [distDir] [androidPublicDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] || 'dist';
const pub = process.argv[3] || 'android/app/src/main/assets/public';

const fail = (message) => {
    console.error(`[verify-feedback-overlay] FAIL: ${message}`);
    process.exit(1);
};

const findChunk = (dir) => {
    const assets = join(dir, 'assets');
    if (!existsSync(assets)) fail(`${assets} 不存在 —— 前端没构建 / cap sync 没跑？`);
    const chunks = readdirSync(assets).filter((name) => /^FeedbackPanel-.*\.js$/.test(name));
    if (chunks.length !== 1) fail(`${assets} 里 FeedbackPanel chunk 数量为 ${chunks.length}（应为 1，可能有旧包残留）`);
    return { name: chunks[0], source: readFileSync(join(assets, chunks[0]), 'utf8') };
};

// 修复的三个产物指纹：装饰层标记、容器严格判定、面板阻断冒泡。
const assertFixed = (label, source) => {
    if (!source.includes('data-native-decoration')) fail(`${label}: 缺 data-native-decoration，遮罩可能被采成全屏热区`);
    if (!source.includes('pointer-events-none')) fail(`${label}: 遮罩缺 pointer-events-none`);
    if (!source.includes('currentTarget')) fail(`${label}: 关闭逻辑缺 event.target === event.currentTarget 判定`);
    if (!source.includes('stopPropagation')) fail(`${label}: 面板容器缺 stopPropagation`);
    const scrimAt = source.indexOf('data-native-decoration');
    const scrim = source.slice(Math.max(0, scrimAt - 60), scrimAt + 190);
    if (scrim.includes('onClick')) fail(`${label}: 遮罩自身仍带 onClick（会成为吞点击的热区）`);
    if (/jsx\)\(`button`/.test(source.slice(Math.max(0, scrimAt - 500), scrimAt))) {
        fail(`${label}: 遮罩仍是全屏 <button>`);
    }
};

const built = findChunk(dist);
const bundled = findChunk(pub);
assertFixed('dist', built.source);
assertFixed('android assets', bundled.source);

if (built.name !== bundled.name) {
    fail(`chunk 不一致：dist 是 ${built.name}，Android 资产是 ${bundled.name} —— cap sync 没把新构建同步进去`);
}
if (built.source !== bundled.source) {
    fail('dist 与 Android 资产里的 FeedbackPanel chunk 内容不一致');
}
const distIndex = readFileSync(join(dist, 'index.html'), 'utf8');
const pubIndex = readFileSync(join(pub, 'index.html'), 'utf8');
if (distIndex !== pubIndex) fail('index.html 与 dist 不一致（可能引用了旧 chunk）');

console.log(`[verify-feedback-overlay] OK: ${built.name} 已同步进 Android 资产，遮罩为装饰层且关闭判定严格`);
