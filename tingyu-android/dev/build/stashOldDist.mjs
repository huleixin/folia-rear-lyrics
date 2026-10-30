#!/usr/bin/env node
/**
 * 构建前把旧 dist 原子移出构建路径（rename，不是删除）。
 *
 * 背景：本机 node safe-delete shim 会拦截 vite emptyOutDir 对大目录（>50 文件）的
 * rmSync —— dist/assets 每次都有近 2000 个文件，构建必然失败。此前靠手工 mv 绕过，
 * 属于临时操作；本脚本把它固化成构建链的第一步：
 *   - 只做 renameSync（同卷瞬时、不删任何文件）到工作区 .trash-old/dist-<时间戳>；
 *   - 旧产物永远留在那里等人工清理，脚本自己从不 rm；
 *   - rename 失败（文件被占用等）→ 非零退出，把问题暴露给 `&&` 链，绝不带病构建。
 *
 * 之后 vite 在一个不存在的目录上全新构建，emptyOutDir 变成空操作，shim 不再介入。
 */
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../../dist');
const trashRoot = resolve(here, '../../../.trash-old');

if (!existsSync(dist)) {
    console.log('[stash-old-dist] dist 不存在，全新构建');
    process.exit(0);
}
mkdirSync(trashRoot, { recursive: true });
const target = join(trashRoot, `dist-${new Date().toISOString().replace(/[:.]/g, '-')}`);
try {
    renameSync(dist, target);
    console.log(`[stash-old-dist] 旧 dist 已移到 ${target}（未删除，等待人工清理）`);
} catch (error) {
    console.error(`[stash-old-dist] FAIL: 无法移走旧 dist（可能有文件被占用）: ${error.message}`);
    process.exit(1);
}
