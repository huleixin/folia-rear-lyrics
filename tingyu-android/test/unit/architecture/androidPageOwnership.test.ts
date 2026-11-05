import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// test/unit/architecture/androidPageOwnership.test.ts
// Android 页面归属回归（docs/ANDROID-PAGE-OWNERSHIP.md §6）。
//
// 目的不是"跑通业务"，而是把架构约束钉成测试：一旦有人把旧 WebView 页面的门控改回
// 运行时可变量、把 NATIVE_FIRST 拆掉、或重新启用被淘汰的 DOM 分支，这里直接失败。
// 规则都写在 dev/build/androidWebUiOwnership.json 里，修改规则=修改架构决策，
// 需要同步更新 docs/ANDROID-PAGE-OWNERSHIP.md。

type Invariant = {
    id: string;
    file: string;
    mustContain?: string;
    mustNotContain?: string;
    why: string;
};

type OwnershipConfig = {
    invariants: Invariant[];
    webviewAllowlist: string[];
};

const root = resolve(__dirname, '../../..');
const config = JSON.parse(
    readFileSync(resolve(root, 'dev/build/androidWebUiOwnership.json'), 'utf8'),
) as OwnershipConfig;

const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('Android 页面归属约束', () => {
    it('配置本身可用（必须有 invariants 与白名单）', () => {
        expect(config.invariants.length).toBeGreaterThan(4);
        expect(config.webviewAllowlist.length).toBeGreaterThan(0);
    });

    for (const rule of config.invariants) {
        it(`${rule.id}：${rule.why}`, () => {
            const source = read(rule.file);
            if (rule.mustContain) {
                expect(source, `${rule.file} 必须包含 ${rule.mustContain}`).toContain(rule.mustContain);
            }
            if (rule.mustNotContain) {
                expect(source, `${rule.file} 不得包含 ${rule.mustNotContain}`).not.toContain(rule.mustNotContain);
            }
        });
    }

    it('WebView 白名单文件全部存在（删除白名单文件必须同步更新配置）', () => {
        for (const file of config.webviewAllowlist) {
            expect(() => read(file), `白名单文件缺失：${file}`).not.toThrow();
        }
    });

    it('已原生化的页面适配器仍在被调用（防止把适配器一并删掉造成白屏）', () => {
        const cases: Array<[string, string]> = [
            ['src/library/suites/mobile/MobileHome.tsx', 'NativeHomePage'],
            ['src/library/suites/mobile/MobileCollection.tsx', 'useNativeCollectionPage('],
            ['src/library/suites/mobile/MobileArtist.tsx', 'useNativeArtistPage('],
            ['src/components/app/search/SearchWorkspace.tsx', 'useNativeSearchPage('],
        ];
        for (const [file, needle] of cases) {
            expect(read(file), `${file} 必须继续调用 ${needle}`).toContain(needle);
        }
    });
});
