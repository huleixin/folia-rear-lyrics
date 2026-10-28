// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { returnFromNativeStage } from '@/services/nativeStageReturn';
import { useAppViewStore } from '@/stores/useAppViewStore';
import { useSettingsModalStore } from '@/stores/useSettingsModalStore';

// test/unit/services/nativeStageReturn.test.ts
const native=vi.hoisted(()=>({collapseStage:vi.fn()}));
vi.mock('@/services/nativeChrome',()=>({PREHIDE_COMPOSE_CHROME:true,chromeNative:native}));
vi.mock('@/i18n/config',()=>({default:{t:(key:string)=>key},readStoredAppLanguagePreference:()=> 'system',applyAppLanguagePreference:vi.fn()}));
afterEach(()=>{vi.useRealTimers();useAppViewStore.setState({view:'home'});vi.clearAllMocks();});
it('retains the stage during the native exit and coalesces repeated Back presses',async()=>{
    useAppViewStore.setState({view:'player'});
    useSettingsModalStore.getState().closeSettings();
    let finish!:()=>void;native.collapseStage.mockReturnValue(new Promise<void>(resolve=>finish=resolve));
    const back=vi.fn(()=>useAppViewStore.setState({view:'home'}));
    returnFromNativeStage(back);returnFromNativeStage(back);
    expect(native.collapseStage).toHaveBeenCalledOnce();expect(back).not.toHaveBeenCalled();
    expect(useAppViewStore.getState().view).toBe('player');
    finish();await Promise.resolve();await Promise.resolve();await Promise.resolve();
    expect(back).toHaveBeenCalledOnce();expect(useAppViewStore.getState().view).toBe('home');
});
it('still returns if an unavailable native renderer never replies',async()=>{
    vi.useFakeTimers();useAppViewStore.setState({view:'player'});
    native.collapseStage.mockReturnValue(new Promise(()=>{}));
    const back=vi.fn(()=>useAppViewStore.setState({view:'home'}));returnFromNativeStage(back);
    await vi.advanceTimersByTimeAsync(900);expect(back).toHaveBeenCalledOnce();
});
