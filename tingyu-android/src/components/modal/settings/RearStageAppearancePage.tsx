import {isAndroidNativeRuntime} from '../../../utils/platform';
import {getFoliaNative} from '../../../platform/foliaNative';
import React,{lazy,Suspense,useEffect,useState,useRef} from 'react';
import {ChevronRight,Archive,Download,Upload} from 'lucide-react';
import {useRearStageAppearanceStore,exportRearAppearance} from '../../../stores/useRearStageAppearanceStore';
import {rearStageEditorProps} from './rearStageEditorProps';
import {rearStageEditorAssets,rearBackgroundAssets} from './rearStageEditorAssets';
import {loadRearThemeEditor,peekRearThemeEditor,warmRearThemeEditor} from './rearAppearanceModules';
import SettingsFrameRateSlider from './SettingsFrameRateSlider';
import type {RearSettingsPage} from './rearControlModel';
import {useTranslation} from 'react-i18next';

// src/components/modal/settings/RearStageAppearancePage.tsx
// The existing editor receives only rear-profile setters. It cannot mutate front playback/UI state.
const VisPlayground=lazy(()=>import('../../visualizer/VisPlayground'));
function AppearanceSwitch({label,checked,disabled,onChange}:{label:string;checked:boolean;disabled:boolean;onChange:()=>void}){
    return <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled}
        className="ty-settings-switch" onClick={onChange}><span className="ty-settings-switch-thumb"/></button>;
}
export default function RearStageAppearancePage({page,open}:{page:RearSettingsPage;open:(page:RearSettingsPage)=>void}){
    const state=useRearStageAppearanceStore(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[importText,setImport]=useState('');
    const file=useRef<HTMLInputElement>(null),{t}=useTranslation();
    const [loadedTheme,setLoadedTheme]=useState(()=>peekRearThemeEditor());
    const ThemeQuickEditor=loadedTheme??peekRearThemeEditor();
    useEffect(()=>{
        if(page!=='appearance-theme'||ThemeQuickEditor)return;
        let alive=true;
        void loadRearThemeEditor().then(module=>{if(alive)setLoadedTheme(()=>module.default);},error=>{if(alive)setError(String(error));});
        return()=>{alive=false;};
    },[page,ThemeQuickEditor]);
    useEffect(()=>{void state.initialize();},[]);
    // No new startup work: prewarm only while the appearance overview owns this queue entry.
    useEffect(()=>page==='appearance'?warmRearThemeEditor():undefined,[page]);
    const choose=async(mode:'follow'|'independent')=>{if(busy)return;setBusy(true);setError('');try{await state.setMode(mode);}catch(error){setError(String(error));}finally{setBusy(false);}};
    const profile=state.profile,visual=profile?.visual??state.front?.visual;
    const independent=state.mode==='independent',editable=independent&&!!profile&&state.ready&&!busy;
    const exportBackup=async()=>{try{const content=JSON.stringify(exportRearAppearance(),null,2);if(isAndroidNativeRuntime()){await getFoliaNative<{shareTextFile:(o:{filename:string;content:string;title:string})=>Promise<void>}>().shareTextFile({filename:'tingyu-rear-appearance.json',content,title:t('rearAppearance.export')});}else{const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='tingyu-rear-appearance.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}}catch(error){setError(String(error));}};
    const restore=async(text:string)=>{setBusy(true);setError('');try{await state.restore(JSON.parse(text));}catch(error){setError(String(error));}finally{setBusy(false);}};
    const loading=<p className="ty-rear-editor-loading" role="status">{t('rearAppearance.loading')}</p>;
    if(page==='appearance-editor'&&profile&&independent){
        const props=rearStageEditorProps(profile.visual,()=>open('appearance'));
        return <div data-rear-editor="stage"><Suspense fallback={loading}><VisPlayground {...props} presentation="page" {...rearStageEditorAssets()} backgroundActions={{...props.backgroundActions,customImage:rearBackgroundAssets()}} /></Suspense></div>;
    }
    if(page==='appearance-theme'&&profile&&independent)return <div data-rear-editor="theme">{ThemeQuickEditor?<ThemeQuickEditor presentation="page" kind="custom" initialTheme={profile.themes??{light:profile.visual.theme,dark:profile.visual.theme}} coverUrl={null} isDaylight={profile.visual.isDaylight} promptSourceText={null} isPureMusic={false} songTitle={undefined} onClose={()=>open('appearance')} onSave={dual=>{state.patch({},undefined,dual);open('appearance');}} />:error?<p className="ty-rear-notice" role="alert">{error}</p>:loading}</div>;
    if(page==='appearance-backup')return <div className="ty-rear-center" data-rear-page="appearance-backup">
        <div className="ty-settings-card">
            <button className="ty-settings-row" disabled={!editable} onClick={()=>void exportBackup()}><Download size={18}/><span className="ty-settings-row-copy"><strong>{t('rearAppearance.export')}</strong></span><ChevronRight size={18}/></button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={event=>{const selected=event.target.files?.[0];if(selected)void selected.text().then(restore).catch(error=>setError(String(error))).finally(()=>{if(file.current)file.current.value='';});}}/>
            <button className="ty-settings-row" disabled={!editable} onClick={()=>file.current?.click()}><Upload size={18}/><span className="ty-settings-row-copy"><strong>{t('rearAppearance.importFile')}</strong></span><ChevronRight size={18}/></button>
        </div>
        <div className="ty-settings-card ty-rear-import">
            <label htmlFor="rear-appearance-json" className="ty-settings-feature-title">{t('rearAppearance.paste')}</label>
            <textarea id="rear-appearance-json" disabled={!editable} aria-label={t('rearAppearance.import')} value={importText} onChange={e=>setImport(e.target.value)} rows={5} spellCheck={false}/>
            <button className="ty-settings-row" disabled={!editable||!importText.trim()} onClick={()=>void restore(importText)}><span className="ty-settings-row-copy"><strong>{t('rearAppearance.import')}</strong></span><ChevronRight size={18}/></button>
        </div>
        {(error||state.error)&&<p className="ty-rear-notice" role="alert">{error||state.error}</p>}
    </div>;
    return <div className="ty-rear-center" data-rear-page="appearance">
        <div className="ty-settings-feature">
            <div className="ty-settings-card"><div className="ty-settings-row">
                <span className="ty-settings-row-copy"><strong>{t('rearAppearance.independentSwitch')}</strong><small>{t(independent?'rearAppearance.independentSummary':'rearAppearance.followSummary')}</small></span>
                <AppearanceSwitch label={t('rearAppearance.independentSwitch')} checked={independent} disabled={busy||!state.ready} onChange={()=>void choose(independent?'follow':'independent')}/>
            </div></div>
            <p className="ty-rear-footnote">{t('rearAppearance.preserveHint')}</p>
        </div>
        <fieldset className="ty-rear-appearance-fields" disabled={!editable}>
            <div className="ty-settings-card">
                <button className="ty-settings-row" onClick={()=>open('appearance-editor')}><span className="ty-settings-row-copy"><strong>{t('rearAppearance.edit')}</strong><small>{t('rearAppearance.editHint')}</small></span><ChevronRight size={18}/></button>
                <button className="ty-settings-row" onPointerDown={()=>{void loadRearThemeEditor().catch(()=>{});}} onFocus={()=>{void loadRearThemeEditor().catch(()=>{});}} onClick={()=>open('appearance-theme')}><span className="ty-settings-row-copy"><strong>{t('rearAppearance.theme')}</strong><small>{visual?.theme.name}</small></span><ChevronRight size={18}/></button>
                <div className="ty-settings-row"><span className="ty-settings-row-copy"><strong>{t('rearAppearance.daylight')}</strong><small>{t('rearAppearance.daylightHint')}</small></span>
                    <AppearanceSwitch label={t('rearAppearance.daylight')} checked={!!visual?.isDaylight} disabled={!editable} onChange={()=>state.patch({isDaylight:!visual?.isDaylight})}/></div>
                <div className="ty-settings-row"><span className="ty-settings-row-copy"><strong>{t('mobileSettings.staticModeTitle')}</strong></span>
                    <AppearanceSwitch label={t('mobileSettings.staticModeTitle')} checked={!!visual?.staticMode} disabled={!editable} onChange={()=>state.patch({staticMode:!visual?.staticMode})}/></div>
                <div className="ty-rear-fps">
                    <div className="ty-settings-row"><span className="ty-settings-row-copy"><strong>{t('mobileSettings.frameRateTitle')}</strong></span>
                        <AppearanceSwitch label={t('mobileSettings.frameRateTitle')} checked={visual?.visualizerFrameRate!=='off'} disabled={!editable} onChange={()=>state.patch({visualizerFrameRate:visual?.visualizerFrameRate==='off'?60:'off'})}/></div>
                    <SettingsFrameRateSlider value={visual?.visualizerFrameRate??60} disabled={!editable||visual?.visualizerFrameRate==='off'} onChange={visualizerFrameRate=>state.patch({visualizerFrameRate})} className="ty-rear-fps-range w-full"/>
                </div>
            </div>
            <div className="ty-settings-card ty-rear-backup-entry"><button className="ty-settings-row" onClick={()=>open('appearance-backup')}><Archive size={18}/><span className="ty-settings-row-copy"><strong>{t('rearAppearance.backup')}</strong><small>{t('rearAppearance.backupHint')}</small></span><ChevronRight size={18}/></button></div>
        </fieldset>
        {(error||state.error)&&<p className="ty-rear-notice" role="alert">{error||state.error}</p>}
    </div>;
}
