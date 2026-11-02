import {isAndroidNativeRuntime} from '../../../utils/platform';
import {getFoliaNative} from '../../../platform/foliaNative';
import React,{lazy,Suspense,useEffect,useState,useRef} from 'react';
import {useRearStageAppearanceStore,exportRearAppearance} from '../../../stores/useRearStageAppearanceStore';
import {rearStageEditorProps} from './rearStageEditorProps';
import {rearStageEditorAssets,rearBackgroundAssets} from './rearStageEditorAssets';
import type {RearSettingsPage} from './rearControlModel';
import {useTranslation} from 'react-i18next';

// src/components/modal/settings/RearStageAppearancePage.tsx
// The existing editor receives only rear-profile setters. It cannot mutate front playback/UI state.
const VisPlayground=lazy(()=>import('../../visualizer/VisPlayground'));
const ThemeQuickEditor=lazy(()=>import('../../panelTab/ThemeQuickEditor').then(m=>({default:m.ThemeQuickEditor})));
export default function RearStageAppearancePage({page,open}:{page:RearSettingsPage;open:(page:RearSettingsPage)=>void}){
    const state=useRearStageAppearanceStore(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[importText,setImport]=useState('');
    const file=useRef<HTMLInputElement>(null);
    const exportBackup=async()=>{try{const content=JSON.stringify(exportRearAppearance(),null,2);if(isAndroidNativeRuntime()){await getFoliaNative<{shareTextFile:(o:{filename:string;content:string;title:string})=>Promise<void>}>().shareTextFile({filename:'tingyu-rear-appearance.json',content,title:t('rearAppearance.export')});}else{const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='tingyu-rear-appearance.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}}catch(error){setError(String(error));}};
    const {t}=useTranslation();useEffect(()=>{void state.initialize();},[]);
    const choose=async(mode:'follow'|'independent')=>{if(busy)return;setBusy(true);setError('');try{await state.setMode(mode);}catch(error){setError(String(error));}finally{setBusy(false);}};
    const profile=state.profile;
    if(page==='appearance-editor'&&profile&&state.mode==='independent'){
        const props=rearStageEditorProps(profile.visual,()=>open('appearance'));
        return <div data-rear-editor><Suspense fallback={<p role="status">{t('rearAppearance.loading')}</p>}><VisPlayground {...props} {...rearStageEditorAssets()} backgroundActions={{...props.backgroundActions,customImage:rearBackgroundAssets()}} /></Suspense></div>;
    }
    if(page==='appearance-theme'&&profile&&state.mode==='independent')return <div data-rear-editor><Suspense fallback={<p role="status">{t('rearAppearance.loading')}</p>}><ThemeQuickEditor kind="custom" initialTheme={profile.themes??{light:profile.visual.theme,dark:profile.visual.theme}} coverUrl={null} isDaylight={profile.visual.isDaylight} promptSourceText={null} isPureMusic={false} songTitle={undefined} onClose={()=>open('appearance')} onSave={dual=>{state.patch({},undefined,dual);open('appearance');}} /></Suspense></div>;
    return <div className="ty-rear-center" data-rear-page="appearance">
        <div className="ty-settings-feature"><h2 className="ty-settings-group-title">{t('rearAppearance.modeLabel')}</h2><div className="ty-rear-choices" role="group" aria-label={t('rearAppearance.title')}>
            {(['follow','independent'] as const).map(mode=><button key={mode} aria-pressed={state.mode===mode} disabled={busy||!state.ready} onClick={()=>void choose(mode)}>{t(`rearAppearance.${mode}`)}</button>)}
        </div><p className="ty-rear-footnote">{t(state.mode==='follow'?'rearAppearance.followHint':'rearAppearance.independentHint')}</p></div>
        {state.mode==='independent'&&profile&&<div className="ty-settings-card">
            <button className="ty-settings-row" onClick={()=>open('appearance-editor')}><span className="ty-settings-row-copy"><strong>{t('rearAppearance.edit')}</strong><small>{t('rearAppearance.editHint')}</small></span><span aria-hidden>›</span></button>
            <button className="ty-settings-row" onClick={()=>open('appearance-theme')}><span className="ty-settings-row-copy"><strong>{t('rearAppearance.theme')}</strong><small>{profile.visual.theme.name}</small></span><span aria-hidden>›</span></button>
            <button className="ty-settings-row" role="switch" aria-checked={profile.visual.isDaylight} onClick={()=>state.patch({isDaylight:!profile.visual.isDaylight})}><span className="ty-settings-row-copy"><strong>{t('rearAppearance.daylight')}</strong></span><span>{t(profile.visual.isDaylight?'rearControl.enabled':'rearControl.disabled')}</span></button>
            <button className="ty-settings-row" role="switch" aria-checked={profile.visual.staticMode} onClick={()=>state.patch({staticMode:!profile.visual.staticMode})}><span className="ty-settings-row-copy"><strong>{t('mobileSettings.staticModeTitle')}</strong></span><span>{t(profile.visual.staticMode?'rearControl.enabled':'rearControl.disabled')}</span></button>
            <label className="ty-settings-row"><span className="ty-settings-row-copy"><strong>{t('mobileSettings.frameRateTitle')}</strong></span><select className="bg-transparent" aria-label={t('mobileSettings.frameRateTitle')} value={profile.visual.visualizerFrameRate??60} onChange={event=>state.patch({visualizerFrameRate:event.target.value==='off'?'off':Number(event.target.value) as 30|60|90|120})}>{[30,60,90,120].map(fps=><option key={fps} value={fps}>{fps} FPS</option>)}<option value="off">{t('rearAppearance.unlimited')}</option></select></label>
        </div>}
        <details className="ty-settings-feature mt-4"><summary>{t('rearAppearance.backup')}</summary>
            <button className="ty-settings-row" onClick={()=>void exportBackup()}>{t('rearAppearance.export')}</button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={event=>{const selected=event.target.files?.[0];if(!selected)return;setBusy(true);void selected.text().then(text=>state.restore(JSON.parse(text))).catch(error=>setError(String(error))).finally(()=>{setBusy(false);if(file.current)file.current.value='';});}} />
            <button className="ty-settings-row" disabled={busy} onClick={()=>file.current?.click()}>{t('rearAppearance.importFile')}</button>
            <textarea className="w-full rounded-xl p-3 bg-transparent border border-current/20" aria-label={t('rearAppearance.import')} value={importText} onChange={e=>setImport(e.target.value)} />
            <button className="ty-settings-row" disabled={busy||!importText.trim()} onClick={()=>{setBusy(true);void Promise.resolve().then(()=>state.restore(JSON.parse(importText))).catch(error=>setError(String(error))).finally(()=>setBusy(false));}}>{t('rearAppearance.import')}</button>
        </details>
        {(error||state.error)&&<p className="ty-rear-notice" role="alert">{error||state.error}</p>}
    </div>;
}
