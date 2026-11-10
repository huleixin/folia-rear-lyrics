import { test, expect } from './fixtures';
import type { SettingsLayoutNode } from '../../src/types/settingsLayout';
import type { NativeSettingsDocument, NativeSettingsFlow } from '../../src/types/nativeSettingsDocument';

const layoutNodes=(node:SettingsLayoutNode):SettingsLayoutNode[]=>[node,...(node.children??[]).flatMap(layoutNodes)];

// test/component/nativeSettingsSemantic.spec.ts
// Real state hosts and handlers; Android pixels/IME still require Compose/device validation.
test.use({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
test('all settings categories and nested editors expose native forms without DOM geometry', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('library_suite', 'mobile'); localStorage.setItem('last_app_view', 'home'); localStorage.setItem('i18nextLng', 'zh-CN'); });
    await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByTestId('mobile-home').waitFor({ state: 'visible', timeout: 60000 });
    // App's lazy home can attach before the parent dialog host commits its subscription.
    await page.waitForTimeout(2000);
    const open = async (section: string) => {
        await page.evaluate(async section => {
            const path = '/src/stores/useSettingsModalStore.ts'; const { useSettingsModalStore: store } = await import(/* @vite-ignore */ path);
            store.getState().closeSettings(); store.getState().openSettingsFromIndex(section);
        }, section);
        await page.locator('[data-folia-settings-overlay]').first().waitFor({ state: 'attached' });
        await page.waitForTimeout(500);
    };
    const capture = (): Promise<NativeSettingsDocument> => page.evaluate(async () => {
        const path = '/src/services/nativeSettingsSemantic.ts'; const { captureSemanticSettings } = await import(/* @vite-ignore */ path);
        const root = document.querySelector<HTMLElement>('[data-folia-settings-overlay]')!;
        const original = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = () => { throw new Error('Settings capture must not measure DOM geometry'); };
        try {
            const result = captureSemanticSettings(root, 'qa', '设置');
            (window as any).__semanticSettings = result;
            return result.document;
        } finally { Element.prototype.getBoundingClientRect = original; }
    });
    const action = async (label: string) => {
        await page.evaluate(label => {
            const s = (window as any).__semanticSettings;
            const node = (s.document.flow as NativeSettingsFlow).nodes.find(n => n.kind === 'action' && n.title.includes(label));
            if (!node) throw new Error(`Missing action: ${label}`);
            s.actions[`act:${node.id}`]({});
        }, label);
        await page.waitForTimeout(400);
    };
    for (const section of ['appearance', 'general', 'playback', 'integration', 'storage', 'graphics', 'developer', 'help']) {
        await open(section); const doc = await capture();
        expect(doc.flow?.nodes.length, section).toBeGreaterThan(3);
        expect(doc.flow?.layout?.children?.length,section).toBeGreaterThan(0);
        if(section==='help')expect(layoutNodes(doc.flow!.layout!).some(node=>node.kind==='control'&&node.style?.fill),section).toBe(true);
        else expect(layoutNodes(doc.flow!.layout!).some(node=>node.kind==='card'),section).toBe(true);
        expect(doc.paints).toEqual([]); expect(doc.controls).toEqual([]); expect(doc.areas).toEqual([]);
        if (section === 'appearance') expect(doc.flow?.nodes.some(n => n.title.includes('导入配置'))).toBe(true);
        if(section==='developer'){
            await action('Level');const menu=(await capture()).flow?.modal;
            expect(menu?.title).toBe('Level');expect(menu?.nodes.some(n=>n.title.includes('error'))).toBe(true);
            await page.evaluate(()=>(window as any).__semanticSettings.actions.dismiss({}));await page.waitForTimeout(300);
        }
    }
    await open('playback');
    const playback=(await capture()).flow!;
    expect(layoutNodes(playback.layout!).some(node=>node.kind==='grid'&&node.style?.columns===2&&node.children?.length===2)).toBe(true);
    const order = playback.nodes.find(n => n.kind === 'reorder')!;
    expect(order).toBeTruthy();
    const reordered = order.options!.map(o => o.value).reverse();
    await page.evaluate(({ id, values }) => (window as any).__semanticSettings.actions[`act:${id}`]({ text: JSON.stringify(values) }), { id: order.id, values: reordered });
    await expect.poll(async () => (await capture()).flow?.nodes.find(n => n.kind === 'reorder')?.options?.map(o => o.value)).toEqual(reordered);
    await open('playback'); await capture(); await action('全局时间偏移');
    expect((await capture()).flow?.nodes.some(n => n.kind === 'slider')).toBe(true);
    await page.evaluate(() => (window as any).__semanticSettings.actions.back({})); await page.waitForTimeout(400);
    await open('playback'); await capture(); await action('歌词过滤');
    const filter = (await capture()).flow!; expect(filter.nodes.some(n => n.kind === 'switch')).toBe(true); expect(filter.nodes.some(n => n.kind === 'input')).toBe(true);
    await open('appearance'); await capture(); await action('歌词动画样式');
    await page.locator('[data-folia-stage-preview]').waitFor();
    // Web builds do not mark this island native-owned; the Android build does.
    await page.locator('[data-folia-stage-preview]').evaluate(node => { (node as HTMLElement).dataset.nativeLive = 'true'; });
    const stage = (await capture()).flow!;
    expect(stage.nodes.some(n => n.kind === 'preview')).toBe(true);
    expect(layoutNodes(stage.layout!).find(n=>n.kind==='control'&&n.style?.preview==='stage')?.children?.some(n=>n.style?.overlay==='pause')).toBe(true); expect(stage.nodes.some(n => n.title === '暂停预览')).toBe(true);
    await action('主题与配色'); await page.locator('[data-native-color]').waitFor(); await capture();
    await page.evaluate(() => { const s = (window as any).__semanticSettings, n = s.document.flow.nodes.find((n: any) => n.kind === 'color'); s.actions[`act:${n.id}`]({ text: '#447755' }); });
    await expect.poll(async () => (await capture()).flow?.nodes.find(n => n.kind === 'color')?.value).toBe('#447755');
    expect(errors).toEqual([]);
});
