// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
vi.mock('@/i18n/config',()=>({default:{t:(key:string)=>key},readStoredAppLanguagePreference:()=> 'system',applyAppLanguagePreference:vi.fn()}));
import {useSettingsModalStore} from '@/stores/useSettingsModalStore';

// test/unit/settings/settingsReturnRoute.test.ts
it('records index entry atomically and clears the section on return',()=>{
    const store=useSettingsModalStore;store.getState().openSettingsFromIndex('playback');
    expect(store.getState().settingsModalState).toMatchObject({initialSubview:'playback',returnToIndex:true});
    store.getState().returnSettingsToIndex();expect(store.getState().settingsModalState).toMatchObject({initialTab:'options',initialSubview:null});
    expect(store.getState().settingsModalState.returnToIndex).not.toBe(true);
});
it('does not retain index return semantics when opened directly from stage',()=>{
    const store=useSettingsModalStore;store.getState().openSettingsFromIndex('general');
    store.getState().openSettings('options','playback');expect(store.getState().settingsModalState.returnToIndex).not.toBe(true);
    store.getState().openSettings('options','visualizer','visualizer');expect(store.getState().settingsModalState.returnToIndex).not.toBe(true);
});
