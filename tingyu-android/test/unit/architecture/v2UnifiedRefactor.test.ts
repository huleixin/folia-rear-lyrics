import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// test/unit/architecture/v2UnifiedRefactor.test.ts
// 回归门禁：锁定四大一级页面统一重构、设置路由、时光雷达空态、平台隔离及正式封面色板。

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('V2 统一重构与核心修复回归门禁', () => {
    it('nativeShellRouting 显式匹配 discovery 与 search 设置路由', () => {
        const routing = read('src/services/nativeShellRouting.ts');
        expect(routing).toContain("settings.initialSubview==='discovery'||settings.initialSubview==='search'");
        expect(routing).toContain('`settings:document:${settings.initialSubview}`');
    });

    it('时光雷达空数据时允许打开详情页并显示引导语', () => {
        const actions = read('src/library/suites/mobile/native/discovery/useDiscoveryActions.ts');
        const home = read('src/library/suites/mobile/native/discovery/NativeDiscoveryHome.tsx');
        const collection = read('src/library/suites/mobile/native/useNativeCollectionPage.ts');
        expect(actions).toContain('allowEmpty = false');
        expect(home).toContain('多听一些音乐，时光雷达将为你找回曾经的旋律。');
        expect(home).toContain('controls.openSongs(radarNames[kind], list, desc, true)');
        expect(collection).toContain("props.collection.type==='discovery'&&props.collection.description");
    });

    it('推荐页按选中平台严格过滤 feed.results 并动态切换漫游副标题', () => {
        const home = read('src/library/suites/mobile/native/discovery/NativeDiscoveryHome.tsx');
        expect(home).toContain('const scopedResults = useMemo(() => feed.results.filter(');
        expect(home).toContain('`在${activePlatformLabel}发现属于你的下一首`');
        expect(home).not.toContain("sourceItems.push({id:'local'");
    });

    it('设置首页标题为设置，且歌词功能与音乐发现分别合并为统一分组', () => {
        const settingsPage = read('src/components/modal/settings/useNativeSettingsPage.ts');
        expect(settingsPage).toContain("title:'歌词功能'");
        expect(settingsPage).toContain("title:'音乐发现'");
        expect(settingsPage).toContain("subtitle:'推荐来源、探索偏好与内容模块'");
        expect(settingsPage).toContain("subtitle:'搜索来源与结果偏好'");
        expect(settingsPage).not.toContain("title:t('ui.options')");
    });

    it('Kotlin 四个一级页面共享 UnifiedCollapsingHeader 且包含正式视觉色板', () => {
        const header = read('android/app/src/main/java/io/github/huleixin/tingyu/chrome/UnifiedCollapsingHeader.kt');
        const homeKt = read('android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeHomePage.kt');
        const dirKt = read('android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeDirectoryPage.kt');
        const searchKt = read('android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSearchPage.kt');
        const settingsKt = read('android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsPage.kt');
        const artKt = read('android/app/src/main/java/io/github/huleixin/tingyu/chrome/DiscoveryCards.kt');

        expect(header).toContain('UnifiedCollapsingHeader');
        expect(header).toContain('UnifiedPlatformFilterBar');
        expect(homeKt).toContain('UnifiedCollapsingHeader(');
        expect(dirKt).toContain('UnifiedCollapsingHeader(');
        expect(searchKt).toContain('rememberCollapsingProgress(');
        expect(settingsKt).toContain('UnifiedCollapsingHeader(');

        // 专属视觉色板与防重复图标
        expect(artKt).toContain('0xFF193D59');
        expect(artKt).toContain('0xFF35396F');
        expect(artKt).toContain('0xFF805A43');
        expect(artKt).toContain('0xFF245C61');
        expect(settingsKt).toContain('"discovery-settings" to "compass"');
        expect(settingsKt).toContain('"search-settings" to "search"');
        expect(settingsKt).toContain('"desktop-lyrics" to "monitor"');
        expect(settingsKt).toContain('"bluetooth-lyrics" to "car"');
    });
});
