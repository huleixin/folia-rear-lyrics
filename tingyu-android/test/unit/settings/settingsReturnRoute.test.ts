// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
vi.mock('@/i18n/config',()=>({default:{t:(key:string)=>key},readStoredAppLanguagePreference:()=> 'system',applyAppLanguagePreference:vi.fn()}));
import {useSettingsModalStore} from '@/stores/useSettingsModalStore';

// test/unit/settings/settingsReturnRoute.test.ts
it('rear control and advanced navigation reuse settings state and never leak into a later section',()=>{
 const store=useSettingsModalStore;store.getState().openRearSettings();expect(store.getState().settingsModalState).toMatchObject({isOpen:true,initialTab:'options',initialSubview:null,rearPage:'control'});
 store.getState().openRearSettings('advanced');expect(store.getState().settingsModalState.rearPage).toBe('advanced');
 store.getState().returnSettingsToIndex();expect(store.getState().settingsModalState.rearPage).toBeUndefined();
 store.getState().openRearSettings('diagnostics');store.getState().openSettingsFromIndex('storage');expect(store.getState().settingsModalState.rearPage).toBeUndefined();
});
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
