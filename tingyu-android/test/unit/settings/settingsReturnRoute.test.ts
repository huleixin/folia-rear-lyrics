// @vitest-environment jsdom
import {expect,it,vi,afterEach} from 'vitest';
vi.mock('@/i18n/config',()=>({default:{t:(key:string)=>key},readStoredAppLanguagePreference:()=> 'system',applyAppLanguagePreference:vi.fn()}));
import {useSettingsModalStore} from '@/stores/useSettingsModalStore';
import {useAppViewStore} from '@/stores/useAppViewStore';
import {usePlayerViewModeStore} from '@/stores/usePlayerViewModeStore';
import {setNativeShellPublisher} from '@/services/nativeShellCommit';

// test/unit/settings/settingsReturnRoute.test.ts
afterEach(()=>{useSettingsModalStore.getState().closeSettings();setNativeShellPublisher(()=>{});});
it.each([
 {mode:'stage',page:'cover',detour:false},
 {mode:'minimal',page:'cover',detour:false},
 {mode:'minimal',page:'lyrics',detour:false},
 {mode:'minimal',page:'lyrics',detour:true},
] as const)('restores the entry presentation without a sheet transition: %j',origin=>{
 useAppViewStore.setState({view:'player'});
 for(let i=0;i<10;i++){
  usePlayerViewModeStore.setState({...origin,stageTransition:'idle'});
  useSettingsModalStore.getState().openSettings('options','playback');
  expect(useSettingsModalStore.getState().settingsModalState.origin).toMatchObject({view:'player',...origin});
  usePlayerViewModeStore.setState({page:origin.page==='cover'?'lyrics':'cover',detour:!origin.detour,stageTransition:'to-stage'});
  const committed=vi.fn(()=>{
   expect(useSettingsModalStore.getState().settingsModalState.isOpen).toBe(false);
   expect(usePlayerViewModeStore.getState()).toMatchObject({...origin,stageTransition:'idle'});
  });
  setNativeShellPublisher(committed);
  useSettingsModalStore.getState().closeSettings();useSettingsModalStore.getState().closeSettings();
  expect(committed).toHaveBeenCalledTimes(1);
 }
});
it('keeps the original player source while navigating between settings sections',()=>{
 useAppViewStore.setState({view:'player'});usePlayerViewModeStore.setState({mode:'minimal',page:'cover',detour:true});
 useSettingsModalStore.getState().openSettings('options','visualizer');
 const origin=useSettingsModalStore.getState().settingsModalState.origin;
 useSettingsModalStore.getState().openSettings('options','themePark');
 expect(useSettingsModalStore.getState().settingsModalState.origin).toEqual(origin);
});
it('retains an explicit display preference chosen inside settings',()=>{
 useAppViewStore.setState({view:'player'});usePlayerViewModeStore.setState({mode:'minimal',page:'cover',detour:true});
 useSettingsModalStore.getState().openSettings('options','appearance');
 usePlayerViewModeStore.getState().setMode('stage');useSettingsModalStore.getState().closeSettings();
 expect(usePlayerViewModeStore.getState()).toMatchObject({mode:'stage',detour:false,stageTransition:'idle'});
});
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
