// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest';
import {bindSettingsControl} from '@/services/nativeSettingsActions';
import type {SettingsControl} from '@/types/nativeSettingsDocument';
import type {PageActions} from '@/types/nativePages';

// test/unit/settings/nativeSettingsActions.test.ts
beforeEach(()=>{document.body.innerHTML='';if(!window.PointerEvent)vi.stubGlobal('PointerEvent',MouseEvent)});
const control=(kind:SettingsControl['kind']):SettingsControl=>({id:'field',x:0,y:0,w:100,h:40,kind,label:'field',disabled:false});
it('uses original input events and leaves disconnected controls inert',()=>{
    const input=document.createElement('input');document.body.append(input);const onInput=vi.fn();input.addEventListener('input',onInput);
    const actions:PageActions={};bindSettingsControl(input,control('text'),actions);actions.field({text:'new value'});
    expect(input.value).toBe('new value');expect(onInput).toHaveBeenCalledTimes(1);
    input.remove();actions.field({text:'stale'});expect(input.value).toBe('new value');
});
it('commits slider drags through the existing pointer-up listener',()=>{
    const input=document.createElement('input');input.type='range';document.body.append(input);
    const phases:string[]=[];input.addEventListener('pointerdown',()=>phases.push('start'));
    input.addEventListener('input',()=>phases.push('input'));const end=()=>phases.push('commit');window.addEventListener('pointerup',end);
    const actions:PageActions={};bindSettingsControl(input,control('range'),actions);
    actions.field({text:'25',value:1});actions.field({text:'75',value:2});window.removeEventListener('pointerup',end);
    expect(input.value).toBe('75');expect(phases[0]).toBe('start');expect(phases.at(-1)).toBe('commit');
});
it('does not activate disabled controls',()=>{
    const button=document.createElement('button');button.disabled=true;document.body.append(button);const click=vi.fn();button.onclick=click;
    const actions:PageActions={};bindSettingsControl(button,control('click'),actions);actions.field({});expect(click).not.toHaveBeenCalled();
});
it('preserves blur and Enter commit handlers',()=>{
    const input=document.createElement('input');document.body.append(input);const blur=vi.fn(),enter=vi.fn();
    input.addEventListener('focusout',blur);input.addEventListener('keydown',enter);
    const actions:PageActions={};bindSettingsControl(input,control('text'),actions);actions.field({value:4});actions.field({value:5});
    expect(blur).toHaveBeenCalledTimes(1);expect(enter).toHaveBeenCalledWith(expect.objectContaining({key:'Enter'}));
});
