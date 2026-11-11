// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {useRearInteractionStore} from '@/stores/useRearInteractionStore';
import {buildRearControlPage} from '@/components/modal/settings/rearControlModel';
import {rearControlActions} from '@/components/modal/settings/rearControlActions';
import type {RearSettingsController} from '@/components/modal/settings/useRearSettingsController';

// test/unit/settings/rearInteraction.test.ts
it('persists the shared toggle and presents the same state in both backend control centers',async()=>{
    localStorage.clear();useRearInteractionStore.setState({tapControls:true});
    const actions=rearControlActions({} as RearSettingsController,vi.fn(),vi.fn());
    actions['rear:tap-controls']({});
    expect(useRearInteractionStore.getState().tapControls).toBe(false);
    useRearInteractionStore.setState({tapControls:true},false);
    // Simulate restarting with the persisted user choice.
    localStorage.setItem('tingyu-rear-interaction',JSON.stringify({state:{tapControls:false},version:0}));
    await useRearInteractionStore.persist.rehydrate();
    for(const backendMode of ['lsp','shizuku'] as const){
        const page=buildRearControlPage('control',{available:true,busy:false,failed:false,actionFailed:false,tapControls:useRearInteractionStore.getState().tapControls,snapshot:{backendMode}},key=>key);
        const items=page.sections.find(s=>s.id==='rear-links')!.items!;
        expect(items.find(i=>i.id==='tap-controls')).toMatchObject({selected:false,action:'rear:tap-controls'});
        expect(items.findIndex(i=>i.id==='tap-controls')).toBe(items.findIndex(i=>i.id==='appearance')+1);
    }
});
