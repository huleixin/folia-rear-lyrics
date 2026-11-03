// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest';
import {bindSettingsControl} from '@/services/nativeSettingsActions';
import type {SettingsControl} from '@/types/nativeSettingsDocument';
import type {PageActions} from '@/types/nativePages';

const nativePicker=vi.hoisted(()=>({pick:vi.fn()}));
vi.mock('@/services/nativeSettingsFilePicker',()=>({pickNativeSettingsFiles:nativePicker.pick}));

// test/unit/settings/nativeSettingsActions.test.ts
beforeEach(()=>{vi.clearAllMocks();document.body.innerHTML='';delete (window as any).Capacitor;delete document.documentElement.dataset.nativeSettingsDocument;if(!window.PointerEvent)vi.stubGlobal('PointerEvent',MouseEvent)});
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
it('ends native color-pad gestures through both the picker and editor pointer listeners',()=>{
    const pad=document.createElement('div');document.body.append(pad);
    const end=vi.fn(),mouseEnd=vi.fn();window.addEventListener('pointerup',end);window.addEventListener('mouseup',mouseEnd);
    const actions:PageActions={};bindSettingsControl(pad,control('pad'),actions);
    actions.field({value:1,text:'{"x":0.2,"y":0.5}'});actions.field({value:2,text:'{"x":0.8,"y":0.5}'});
    window.removeEventListener('pointerup',end);window.removeEventListener('mouseup',mouseEnd);
    expect(end).toHaveBeenCalledTimes(1);expect(mouseEnd).toHaveBeenCalledTimes(1);
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

it('routes nested file-input clicks from native settings through SAF and preserves React change handlers',async()=>{
    const oldCapacitor=(window as any).Capacitor;
    (window as any).Capacitor={getPlatform:()=> 'android'};
    document.documentElement.dataset.nativeSettingsDocument='true';
    class Transfer {
        files:File[]=[];
        items={add:(file:File)=>{this.files.push(file)}};
    }
    vi.stubGlobal('DataTransfer',Transfer);
    const input=document.createElement('input');input.type='file';input.accept='image/*';
    Object.defineProperty(input,'files',{configurable:true,writable:true,value:[]});
    const button=document.createElement('button');button.onclick=()=>input.click();document.body.append(button,input);
    const file=new File(['image-bytes'],'wallpaper.png',{type:'image/png'});
    nativePicker.pick.mockResolvedValue([file]);
    const changed=vi.fn();input.addEventListener('change',changed);
    const actions:PageActions={};bindSettingsControl(button,control('click'),actions);actions.field({});
    await vi.waitFor(()=>expect(changed).toHaveBeenCalledTimes(1));
    expect(input.files).toEqual([file]);
    expect(nativePicker.pick).toHaveBeenCalledWith(input);
    delete document.documentElement.dataset.nativeSettingsDocument;
    if(oldCapacitor===undefined)delete (window as any).Capacitor;else (window as any).Capacitor=oldCapacitor;
    vi.unstubAllGlobals();
});

it('uses SAF for file inputs activated by a native-tapped label',async()=>{
    const oldCapacitor=(window as any).Capacitor;
    (window as any).Capacitor={getPlatform:()=> 'android'};
    document.documentElement.dataset.nativeSettingsDocument='true';
    class Transfer { files:File[]=[];items={add:(file:File)=>this.files.push(file)}; }
    vi.stubGlobal('DataTransfer',Transfer);
    const label=document.createElement('label'),input=document.createElement('input');input.type='file';input.id='settings-file';
    label.htmlFor=input.id;document.body.append(label,input);
    Object.defineProperty(input,'files',{configurable:true,writable:true,value:[]});
    const file=new File(['x'],'picked.json',{type:'application/json'});nativePicker.pick.mockResolvedValue([file]);
    const changed=vi.fn();input.addEventListener('change',changed);
    const actions:PageActions={};bindSettingsControl(label,control('click'),actions);actions.field({});
    await vi.waitFor(()=>expect(changed).toHaveBeenCalledTimes(1));
    expect(input.files).toEqual([file]);
    delete document.documentElement.dataset.nativeSettingsDocument;
    if(oldCapacitor===undefined)delete (window as any).Capacitor;else (window as any).Capacitor=oldCapacitor;
    vi.unstubAllGlobals();
});

it('leaves browser and Electron file selection on the original input click path',()=>{
    (window as any).Capacitor={getPlatform:()=> 'web'};
    delete document.documentElement.dataset.nativeSettingsDocument;
    const button=document.createElement('button'),input=document.createElement('input');input.type='file';
    const click=vi.spyOn(input,'click');button.onclick=()=>input.click();document.body.append(button,input);
    const actions:PageActions={};bindSettingsControl(button,control('click'),actions);actions.field({});
    expect(click).toHaveBeenCalledTimes(1);
    expect(nativePicker.pick).not.toHaveBeenCalled();
    delete (window as any).Capacitor;
});
