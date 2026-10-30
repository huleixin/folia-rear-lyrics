#!/usr/bin/env node
/**
 * 构建链通用的大目录"移走不删除"工具（shim 友好）。
 *
 * 背景：本机 node safe-delete shim 拦截对 >50 文件目录的 rmSync。三个受害者：
 *   1. vite emptyOutDir 清 dist（→ stashOldDist.mjs）；
 *   2. `cap sync` 清 android/app/src/main/assets/public（≈1900 个 web 资产）；
 *   3. `cap sync` 清 capacitor-cordova-android-plugins。
 * 本脚本把 2/3 也固化成构建链的正规步骤：入参是相对项目根的目录列表，逐个
 * renameSync 到工作区 .trash-old/<名字>-<时间戳>。只 rename、从不 rm；
 * 任何失败都非零退出，让 `&&` 链当场断掉。
 *
 * 目录不存在时视为成功（幂等）。
 */
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '../..');
const trashRoot = resolve(projectRoot, '../../../.trash-old');
const targets = process.argv.slice(2);

if (targets.length === 0) {
    console.error('[stash-dirs] 用法: node stashDirs.mjs <相对路径> [<相对路径> ...]');
    process.exit(1);
}
mkdirSync(trashRoot, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
for (const rel of targets) {
    const abs = resolve(projectRoot, rel);
    if (!existsSync(abs)) {
        console.log(`[stash-dirs] ${rel} 不存在，跳过`);
        continue;
    }
    const target = join(trashRoot, `${rel.replace(/[\\/]/g, '_')}-${stamp}`);
    try {
        renameSync(abs, target);
        console.log(`[stash-dirs] ${rel} -> ${target}（未删除，等待人工清理）`);
    } catch (error) {
        console.error(`[stash-dirs] FAIL: ${rel} 无法移走（可能有文件被占用）: ${error.message}`);
        process.exit(1);
    }
}
