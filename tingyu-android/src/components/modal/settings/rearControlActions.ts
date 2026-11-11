import {useRearInteractionStore} from '../../../stores/useRearInteractionStore';
import type { PageActions } from '../../../types/nativePages';
import type { RearSettingsController } from './useRearSettingsController';
import type { RearSettingsPage } from './rearControlModel';

// src/components/modal/settings/rearControlActions.ts
export function rearControlActions(rear:RearSettingsController,open:(page:RearSettingsPage)=>void,back:()=>void):PageActions {
    const actions:PageActions={'rear:tap-controls':()=>useRearInteractionStore.getState().toggle(),'rear:keep-awake':()=>{void rear.change('keep-awake','')},'rear:aod':()=>{void rear.change('aod','')},'rear:open':()=>open('control'),'rear:back':back,'rear:show':()=>{void rear.show()},'rear:toggle':()=>{void rear.toggle()},'rear:refresh':()=>{void rear.refresh()},'rear:cover':()=>{void rear.change('cover','')}};
    for(const page of ['advanced','guide','diagnostics','appearance'] as const)actions[`rear:${page}`]=()=>open(page);
    for(const [kind,values] of [['backend',['lsp','shizuku']],['engine',['plan-a','legacy']],['route',['auto','reuse','migrate']]] as const)
        for(const value of values)actions[`${kind}:${value}`]=()=>{void rear.change(kind,value)};
    return actions;
}
