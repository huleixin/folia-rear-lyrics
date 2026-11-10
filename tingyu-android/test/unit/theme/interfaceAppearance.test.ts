import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {migrateInterfaceAppearance,resolveInterfaceLight,INTERFACE_APPEARANCE_KEY,interfaceUiTokens} from '@/services/interfaceAppearance';
import {useThemeSettingsStore} from '@/stores/useThemeSettingsStore';
import {getContrastRatio} from '@/utils/themeColorMath';
import {useSleepTimerStore} from '@/stores/useSleepTimerStore';

// test/unit/theme/interfaceAppearance.test.ts
describe('ordinary interface appearance is independent of stage and playback settings',()=>{
    beforeEach(()=>{
        vi.stubGlobal('localStorage',{setItem:vi.fn(),getItem:()=>null});
        useThemeSettingsStore.setState({interfaceAppearance:'dark',interfaceSystemLight:false,isDaylight:false,followSystemTheme:false});
    });
    afterEach(()=>vi.unstubAllGlobals());
    it.each(['light','dark','system'] as const)('persists %s without changing stage, background source or running sleep task',mode=>{
        const before=useThemeSettingsStore.getState();
        useSleepTimerStore.setState({sleepTimerEnabled:true,sleepTimerDeadlineMs:900000,sleepTimerActivationId:41});
        const sleep=useSleepTimerStore.getState();
        useThemeSettingsStore.getState().setInterfaceAppearance(mode);
        const next=useThemeSettingsStore.getState();
        expect(localStorage.setItem).toHaveBeenCalledWith(INTERFACE_APPEARANCE_KEY,mode);
        expect(next.isDaylight).toBe(before.isDaylight);
        expect(next.followSystemTheme).toBe(before.followSystemTheme);
        expect(next.useCoverColorBg).toBe(before.useCoverColorBg);
        expect(useSleepTimerStore.getState()).toBe(sleep);
    });
    it('system changes affect only system mode',()=>{
        for(const system of [false,true]){
            expect(resolveInterfaceLight('light',system)).toBe(true);
            expect(resolveInterfaceLight('dark',system)).toBe(false);
            expect(resolveInterfaceLight('system',system)).toBe(system);
        }
    });
    it('Android migration preserves previously dark native browsing even with a daylight stage',()=>{
        expect(migrateInterfaceAppearance(null,true,true)).toBe('dark');
        expect(migrateInterfaceAppearance('invalid',true,false)).toBe('dark');
        expect(migrateInterfaceAppearance('system',true,false)).toBe('system');
        expect(migrateInterfaceAppearance(null,false,true)).toBe('light');
    });
    it('system updates do not modify the persisted override or stage settings',()=>{
        useThemeSettingsStore.getState().setInterfaceAppearance('dark');
        useThemeSettingsStore.getState().setInterfaceSystemLight(true);
        expect(useThemeSettingsStore.getState()).toMatchObject({interfaceAppearance:'dark',interfaceSystemLight:true,isDaylight:false});
        expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    });
    it('ordinary light text, secondary labels and accent meet AA on page/card/sheet surfaces',()=>{
        for(const background of [interfaceUiTokens()['--ui-bg'],interfaceUiTokens()['--ui-surface'],interfaceUiTokens()['--ui-sheet']]){
            for(const ink of [interfaceUiTokens()['--ui-ink'],interfaceUiTokens()['--ui-muted'],interfaceUiTokens()['--ui-accent']])
                expect(getContrastRatio(ink,background)).toBeGreaterThanOrEqual(4.5);
        }
    });

});
