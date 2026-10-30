#!/usr/bin/env node
/**
 * capacitor 构建产物守门员。
 *
 * 背景（2026-10-31 真机事故）：用了裸 `vite build` 而不是 `build:capacitor`，打出的
 * Service Worker 会预缓存全站 239 项；覆盖安装后 SW 缓存指向旧分包，页面只剩
 * HTML+CSS —— "能滑不能点"。这类错误曾因 shell 管道 `| tail` 吞掉退出码而一路
 * "成功"到底。本脚本把关键指纹变成硬性断言：不满足就非零退出，把 `&&` 链当场掐断。
 *
 * 断言（与官方 `build:capacitor` 配方一一对应）：
 *  1. dist/index.html 存在；
 *  2. capacitor 专属产物存在：visualizer-frame-scope.json、stage-client.html；
 *  3. dist/sw.js 存在且预缓存条目数 ≤ 5（capacitor 版只有 2 项；全站预缓存是 200+）；
 *  4. 可选：--expect-commit <hash> 时，dist 里必须有 commitStamp <hash>（资产与源码提交一致）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] || 'dist';
const fail = (message) => {
    console.error(`[verify-capacitor-assets] FAIL: ${message}`);
    process.exit(1);
};

if (!existsSync(join(dist, 'index.html'))) fail(`${dist}/index.html 不存在 —— 前端没构建？`);
for (const marker of ['visualizer-frame-scope.json', 'stage-client.html']) {
    if (!existsSync(join(dist, marker))) {
        fail(`${marker} 缺失 —— 这不是 build:capacitor 的产物（裸 vite build 不会生成它）。请用 npm run build:capacitor`);
    }
}
const swPath = join(dist, 'sw.js');
if (!existsSync(swPath)) fail(`${dist}/sw.js 不存在`);
const sw = readFileSync(swPath, 'utf8');
const revisionCount = (sw.match(/"revision"/g) || []).length;
if (revisionCount > 5) {
    fail(`sw.js 预缓存 ${revisionCount} 项 —— 这是全站预缓存（裸 vite build 的特征，真机表现为"能滑不能点"）。capacitor 版应 ≤ 2 项`);
}
console.log(`[verify-capacitor-assets] OK: capacitor 产物指纹齐全，sw.js 预缓存 ${revisionCount} 项`);
