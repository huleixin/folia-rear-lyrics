import type { RearLyricsStatus } from '../../../services/rearLyricsControl';
import type { NativePageModel, PageSection } from '../../../types/nativePages';
import { rearSettingsCanToggle, rearSettingsHint } from './rearLyricsSettingsModel';

// src/components/modal/settings/rearControlModel.ts
export type RearSettingsPage = 'control'|'advanced'|'guide'|'diagnostics'|'appearance'|'appearance-editor'|'appearance-theme'|'appearance-backup';
export type RearPresentation = { available:boolean;snapshot:RearLyricsStatus|null;busy:boolean;failed:boolean;actionFailed:boolean;error?:string };
type Translate=(key:string,options?:Record<string,unknown>)=>string;
export const rearPageKey=(page:RearSettingsPage|'index')=>page==='index'?'settings:index':page==='guide'||page==='diagnostics'||page.startsWith('appearance')?`settings:document:rear-${page}`:`settings:rear:${page}`;
export const rearPageBack=(page:RearSettingsPage)=>page==='control'?'index':page==='appearance-editor'||page==='appearance-theme'||page==='appearance-backup'?'appearance':'control';
export const rearModeLocked=(s:RearLyricsStatus|null,busy:boolean)=>!s||busy||!!(s.enabled||s.active||s.starting||s.sleeping);
export function rearRunLabel(s:RearLyricsStatus|null,failed:boolean,t:Translate):string {
    if(failed)return t('mobileSettings.rearState.failed');
    if(!s)return t('mobileSettings.rearState.detecting');
    if(s.starting)return t('mobileSettings.rearState.starting');
    if(s.sleeping)return t('rearControl.sleeping');
    if(s.cameraSuspended||s.yieldingToCamera)return t('rearControl.camera');
    if(s.returnedToSystem)return t('rearBridge.system');
    if(s.active)return t('rearControl.active');
    if(s.enabled)return t('rearControl.waitingDisplay');
    if(typeof s.rearDisplayId==='number'&&s.rearDisplayId<0)return t('mobileSettings.rearState.unsupported');
    return t('mobileSettings.rearState.disabled');
}
export function rearEntrySubtitle(s:RearLyricsStatus|null,failed:boolean,t:Translate){
    return `${s?.backendMode==='lsp'?'LSP':s?.backendMode==='shizuku'?'Shizuku':t('mobileSettings.rearState.detecting')} · ${rearRunLabel(s,failed,t)}`;
}
/** Same compact, capability-aware presentation is consumed by Compose and the Web fallback. */
export function buildRearControlPage(page:'control'|'advanced',state:RearPresentation,t:Translate):NativePageModel {
    const s=state.snapshot,backend=s?.backendMode??'shizuku',locked=rearModeLocked(s,state.busy);
    const sections:PageSection[]=[];
    const chips=(id:string,title:string,choices:[string,string][],selected:string,disabled:boolean)=>({id,title,layout:'chips' as const,items:choices.map(([value,label])=>({id:value,title:label,action:`${id}:${value}`,selected:value===selected,disabled}))});
    if(page==='control'){
        sections.push({id:'rear-summary',layout:'rows',items:[{id:'toggle',title:t('rearControl.title'),subtitle:rearEntrySubtitle(s,state.failed,t),action:'rear:toggle',selected:!!s?.enabled,
            secondaryLabel:t(s?.enabled?'options.rearLyricsReturn':'mobileSettings.rearEnable'),disabled:(state.failed&&!s?.enabled)||!rearSettingsCanToggle(s,state.busy)}]});
        sections.push({...chips('backend',t('rearBridge.mode'),[['lsp','LSP'],['shizuku','Shizuku']],s?backend:'',locked),text:locked&&s?t('rearControl.stopBeforeSwitch'):''});
        const hint=rearSettingsHint(s);
        const failure=state.error||(state.actionFailed?(s?.message||t('mobileSettings.rearActionFailed')):'')||(state.failed?t('mobileSettings.rearState.failed'):'');
        if(failure||hint)sections.push({id:'rear-notice',layout:'message',text:failure||(hint?t(hint):'')});
        const rows=backend==='lsp'?[{id:'module',title:t('rearControl.module'),subtitle:t(s?.lspConnected==null?'rearControl.unknown':s.lspConnected?'rearControl.connected':'rearControl.disconnected')}]:[
            {id:'service',title:t('rearControl.service'),subtitle:t(s?.shizukuAvailable==null?'rearControl.unknown':s.shizukuAvailable?'rearControl.serviceStarted':'rearControl.serviceStopped')},
            {id:'permission',title:t('rearControl.permission'),subtitle:t(s?.shizukuAvailable==null?'rearControl.unknown':!s.shizukuAvailable?'rearControl.serviceStopped':s.authorized==null?'rearControl.unknown':s.authorized?'rearControl.authorized':'rearControl.unauthorized')}];
        sections.push({id:'rear-status',title:t('rearControl.status'),layout:'rows',items:[...rows,
            {id:'preference',title:t('rearControl.preference'),subtitle:t(!s?'rearControl.unknown':s.enabled?'rearControl.enabled':'rearControl.disabled')},
            {id:'display',title:t('rearControl.display'),subtitle:rearRunLabel(s,state.failed,t)},
            {id:'refresh',title:t('rearControl.refresh'),action:'rear:refresh',disabled:state.busy}]});
        sections.push({id:'rear-links',layout:'rows',items:[
            {id:'guide',title:t(backend==='lsp'?'rearControl.moduleGuide':'rearControl.authorizationGuide'),subtitle:t('rearControl.guideBrief'),action:'rear:guide'},
            {id:'appearance',title:t('rearAppearance.title'),subtitle:t('rearAppearance.entryHint'),action:'rear:appearance'},
            {id:'advanced',title:t('rearControl.advanced'),subtitle:t('rearControl.advancedBrief'),action:'rear:advanced'},
            {id:'diagnostics',title:t('rearControl.diagnostics'),subtitle:t('rearControl.diagnosticsBrief'),action:'rear:diagnostics'}]});
    }else{
        sections.push({...chips('engine',t('rearControl.engine'),[['plan-a','Plan A'],['legacy','Legacy']],s?.controlEngine??'plan-a',locked),text:t('rearControl.engineBrief')});
        if(backend==='shizuku')sections.push({...chips('route',t('rearControl.lockedRoute'),[['auto','Auto'],['reuse','Reuse'],['migrate','Migrate']],s?.lockedRoute??'auto',!s||state.busy),text:t('rearControl.routeBrief')});
        sections.push({id:'rear-sleep',title:t('rearControl.power'),layout:'rows',items:[{id:'cover-sleep',title:t('mobileEnhancements.rearCoverSleep'),
            subtitle:t(s?.sleepUnsupported?'rearControl.sleepUnsupported':s?.sensorAvailable?'rearControl.sleepBrief':'rearControl.sensorUnavailable'),
            action:'rear:cover',secondaryLabel:t(s?.coverSleepEnabled?'rearControl.enabled':'rearControl.disabled'),selected:!!s?.coverSleepEnabled,
            disabled:!s||state.busy||(!s.coverSleepEnabled&&(s.sensorAvailable!==true||s.sleepUnsupported===true))}]});
        if(state.error)sections.push({id:'rear-error',layout:'message',text:state.error});
        sections.push({id:'rear-compatibility',title:t('rearControl.compatibility'),layout:'rows',items:[
            {id:'controller',title:t('rearControl.currentMode'),subtitle:backend==='lsp'?'LSP / LSPosed':'Shizuku'},
            {id:'adaptation',title:t('mobileSettings.rearAdaptation'),subtitle:[s?.build==null?'':`r${s.build}`,(s?.rearDisplayId??-1)>=0?t('options.rearLyricsDetected',{id:s?.rearDisplayId}):t('mobileSettings.rearState.unsupported')].filter(Boolean).join(' · ')},
            ...(s?.lastLaunchRoute?[{id:'last-route',title:t('rearControl.lastRoute'),subtitle:s.lastLaunchRoute}]:[]),
            {id:'guide',title:t('mobileSettings.startupGuide'),action:'rear:guide'},
            {id:'diagnostics',title:t('rearControl.diagnostics'),action:'rear:diagnostics'}]});
    }
    return {key:rearPageKey(page),title:t(page==='control'?'rearControl.title':'rearControl.advanced'),leading:'rear:back',trailingLabel:t('mobileSettings.back'),bottomClearance:24,sections};
}
