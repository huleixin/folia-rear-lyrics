import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// test/unit/mod-system/foliumServicesBoundary.test.ts
// 规格要求 services.ts 不 import app store：导出窗口也会加载它，宿主状态只能经主窗口 App
// 注册的 registerFoliumHostActions 进来。这里按源码文本走它的运行时导入闭包（值导入、
// re-export、副作用导入与动态 import()，不含 import type），钉住两件事：
// - 闭包里没有 src/stores 下的模块，也没有只在主窗口装的宿主层（hostActions / hostQueue /
//   hostEvents / hostBridge），它们才是读写 app store 的地方；
// - 闭包里建 zustand store 的模块只有模组侧的 registries/homeTabs（首页模组页面的选中状态）。
//   也就是说「不 import 任何 app store」成立，「不 import 任何 store」不成立；
//   闭包里多出别的 store 时，这条会失败，提醒同时改 services.ts 文件头的那段说明。

const ROOT = path.resolve(__dirname, '../../..');
const ENTRY = 'src/mods/folium/services.ts';
const HOME_TABS = 'src/mods/folium/registries/homeTabs.ts';

const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

/** 运行时会加载的说明符：值导入与 re-export（跳过 `import type` / `export type`）、副作用导入和动态 import()。 */
const runtimeSpecifiersOf = (file: string) => {
    const source = read(file);
    return [
        ...[...source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"];/gms)]
            .filter(match => !/^\s*(?:import|export)\s+type\s/.test(match[0]))
            .map(match => match[1]),
        ...[...source.matchAll(/^\s*import\s+['"]([^'"]+)['"];/gm)].map(match => match[1]),
        ...[...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1]),
    ];
};

/** 仓库内说明符解析成带扩展名的源文件（含 shared/ 下的 .mjs）；裸包名返回 null，找不到文件返回 undefined。 */
const resolveSource = (file: string, specifier: string): string | null | undefined => {
    let base: string;
    if (specifier.startsWith('@/')) base = `src/${specifier.slice(2)}`;
    else if (specifier.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    else return null;
    return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
        .find(candidate => /\.(?:tsx?|m?js)$/.test(candidate) && existsSync(path.join(ROOT, candidate)));
};

/** 从入口走仓库内的运行时导入，回传闭包里的源文件、各自引用的包名，以及解析不到的说明符。 */
const walkRuntimeClosure = (entry: string) => {
    const packagesByFile = new Map<string, string[]>();
    const unresolved: string[] = [];
    const queue = [entry];
    while (queue.length > 0) {
        const file = queue.pop() as string;
        if (packagesByFile.has(file)) continue;
        const packages: string[] = [];
        packagesByFile.set(file, packages);
        for (const specifier of runtimeSpecifiersOf(file)) {
            const target = resolveSource(file, specifier);
            if (target === null) packages.push(specifier);
            else if (target === undefined) unresolved.push(`${file} -> ${specifier}`);
            else queue.push(target);
        }
    }
    return { files: [...packagesByFile.keys()].sort(), packagesByFile, unresolved };
};

describe('folium services import boundary', () => {
    const closure = walkRuntimeClosure(ENTRY);

    it('walks the whole runtime closure of services.ts', () => {
        // 解析不到的说明符会让闭包悄悄变小，这条 gate 就会安静地永远为绿。
        expect(closure.unresolved).toEqual([]);
        expect(closure.files).toContain(ENTRY);
        expect(closure.files).toContain(HOME_TABS);
    });

    it('reaches no app store and none of the main-window host layer', () => {
        const offenders = closure.files.filter(file => (
            /^src\/stores\//.test(file)
            || /^src\/mods\/folium\/host(?:Actions|Queue|Events|Bridge)\.tsx?$/.test(file)
        ));
        expect(offenders).toEqual([]);
    });

    it('creates no zustand store except the mods-owned home-tab selection', () => {
        const storeModules = closure.files.filter(file => (
            (closure.packagesByFile.get(file) ?? []).some(specifier => /^zustand(?:\/|$)/.test(specifier))
        ));
        expect(storeModules).toEqual([HOME_TABS]);
        expect(read(HOME_TABS)).toMatch(/export const useFoliumHomeTabStore = create</);
    });
});
