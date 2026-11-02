// @vitest-environment jsdom
import {beforeEach,it,expect,vi} from 'vitest';

// test/unit/settings/rearAppearanceModules.test.ts
const warm=vi.hoisted(()=>vi.fn(()=>()=>{}));
vi.mock('@/services/uiWarmup',()=>({scheduleUiWarmup:warm}));
vi.mock('@/services/navigationTiming',()=>({navigationMark:vi.fn()}));
vi.mock('@/components/panelTab/ThemeQuickEditor',()=>({ThemeQuickEditor:()=>null}));
beforeEach(()=>{vi.resetModules();warm.mockClear();});
it('shares the in-flight import and exposes the loaded editor synchronously on subsequent navigation',async()=>{
    const m=await import('@/components/modal/settings/rearAppearanceModules');
    expect(m.peekRearThemeEditor()).toBeUndefined();const first=m.loadRearThemeEditor();
    expect(m.loadRearThemeEditor()).toBe(first);const loaded=await first;
    expect(m.peekRearThemeEditor()).toBe(loaded.default);expect(await m.loadRearThemeEditor()).toBe(loaded);
});
it('uses the existing cancellable idle queue instead of loading the editor on startup',async()=>{
    const m=await import('@/components/modal/settings/rearAppearanceModules');const cancel=m.warmRearThemeEditor();
    expect(warm).toHaveBeenCalledWith(m.loadRearThemeEditor);expect(m.peekRearThemeEditor()).toBeUndefined();expect(typeof cancel).toBe('function');
});
