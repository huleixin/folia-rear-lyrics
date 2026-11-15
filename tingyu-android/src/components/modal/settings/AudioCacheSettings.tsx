import OfflineCacheOverview from './OfflineCacheOverview';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Download,Trash2} from 'lucide-react';
import {useAudioCacheStatus} from './useAudioCacheStatus';
import {useResourceCacheStatus} from './useResourceCacheStatus';
import AudioCacheTasks from './AudioCacheTasks';
import './resourceCacheSettings.css';

// Unified cache controls keep audio and shared resources distinct while sharing network policy.
export default function AudioCacheSettings(){
    const {t}=useTranslation(),audio=useAudioCacheStatus(),resources=useResourceCacheStatus();
    const [tasks,setTasks]=useState(false),[clean,setClean]=useState('');
    const s=audio.status,r=resources.status;
    if(!s||!r)return <section className="resource-card"><h3>{t('audioCache.title')}</h3><p>{audio.error||resources.error?t('audioCache.error'):t('mobileLibrary.loading')}</p><button type="button" onClick={()=>{void audio.update();void resources.update();}}>{t('resourceCache.refresh')}</button></section>;
    const text=(key:string)=>t('audioCache.'+key),busy=audio.busy||resources.busy;
    const update=async(next:object)=>{await audio.update('configure',next);await resources.update();};
    const control=async(action:string)=>{await Promise.all([audio.update(action),resources.update(action)]);};
    const hasWork=s.pending+s.running+s.incompleteCatalogs+r.pending+r.platformPending>0,paused=!!s.paused||r.paused;
    const mode=s.autoPlaylist?'all':r.enabled?'resources':'off';
    const switchRow=(key:'enabled'|'wifiOnly')=><div className="resource-setting" data-settings-layout="row" data-settings-style='{"align":"between","gap":16,"font":13}'><span data-settings-layout="wrap" data-settings-style='{"grow":true}'>{text(key)}</span><button type="button" role="switch" aria-label={text(key)} aria-checked={s[key]} disabled={busy} className="resource-switch" onClick={()=>void update({[key]:!s[key]})} data-settings-layout="row"><span data-settings-layout="wrap"/></button></div>;
    return <section className="resource-card offline-cache-card" aria-label={text('title')} data-settings-layout="card" data-settings-style='{"padding":[20,20,20,20],"gap":18,"radius":22,"border":true}'>
        <header className="resource-heading" data-settings-layout="row" data-settings-style='{"gap":12}'><Download size={20}/><div data-settings-layout="column"><h3 data-settings-layout="wrap">{text('title')}</h3><p data-settings-layout="wrap">{text('hint')}</p></div></header>
        {switchRow('enabled')}
        <label className="resource-setting" data-settings-layout="column" data-settings-style='{"gap":8}'>{text('automatic')}<select aria-label={text('automatic')} value={mode} disabled={busy} onChange={e=>void update({autoPlaylist:e.target.value==='all',resourceEnabled:e.target.value!=='off'})}><option value="off">{text('modeOff')}</option><option value="resources">{text('modeResources')}</option><option value="all">{text('modeAll')}</option></select></label>
        <p className="resource-hint" data-settings-layout="wrap" data-settings-style='{"font":12,"tone":"muted"}'>{text('automaticHint')}</p>
        {switchRow('wifiOnly')}
        <OfflineCacheOverview status={s}/>
        {hasWork&&paused&&<span data-settings-layout="wrap">{text('paused')}</span>}
        {!s.networkAllowed&&s.pending+s.running>0&&<span data-settings-layout="wrap">{text('waiting')}</span>}
        {s.incompleteCatalogs>0&&<p className="resource-hint" data-settings-layout="wrap">{text('catalog')}</p>}
        {s.stale>0&&<p className="resource-hint" data-settings-layout="wrap">{text('staleHint')}</p>}
        {(audio.error||resources.error)&&<p role="alert" data-settings-layout="wrap">{text('error')}</p>}
        <button className="offline-cache-primary" data-settings-layout="row" data-settings-style='{"minHeight":48,"center":true,"padding":[16,12,16,12],"radius":12,"border":true,"fill":true,"tone":"accent","font":14,"weight":650}' disabled={busy} onClick={()=>setTasks(true)}>{text('tasks')}</button>
        <div className="offline-cache-actions" data-settings-layout="grid" data-settings-style={JSON.stringify({columns:hasWork&&(s.failed>0||r.failed>0||(r.platformFailed??0)>0)?2:1,gap:10})}>
            {hasWork&&<button className="storage-button" data-settings-layout="row" data-settings-style='{"minHeight":46,"center":true,"padding":[12,10,12,10],"radius":12,"border":true,"font":13}' disabled={busy} onClick={()=>void control(paused?'resume':'pause')}>{text(paused?'resume':'pause')}</button>}
            {(s.failed>0||r.failed>0||(r.platformFailed??0)>0)&&<button className="storage-button" data-settings-layout="row" data-settings-style='{"minHeight":46,"center":true,"padding":[12,10,12,10],"radius":12,"border":true,"font":13}' disabled={busy} onClick={()=>void control('retry')}>{s.failed>0&&r.failed===0&&!(r.platformFailed??0)?t('audioCache.retryCount',{count:s.failed}):text('retry')}</button>}
        </div>
        <button className="storage-button offline-cache-clean" data-settings-layout="row" data-settings-style='{"gap":8,"minHeight":44,"padding":[12,10,12,10],"radius":12,"border":true,"tone":"muted","font":13}' disabled={busy} onClick={()=>setClean(clean?'':'choose')}><Trash2 size={16}/>{text('clean')}</button>
        {clean&&<div data-settings-layout="column" data-settings-style='{"gap":10}'>
            <p className="resource-hint" data-settings-layout="wrap">{text('cleanHint')}</p>
            {clean==='choose'?<div data-settings-layout="wrap" data-settings-style='{"gap":8}'>{['Audio','Resources','All'].map(kind=><button key={kind} data-settings-layout="row" className="storage-text-button" onClick={()=>setClean(kind)}>{text('clean'+kind)}</button>)}</div>:<div data-settings-layout="wrap" data-settings-style='{"gap":8}'><span data-settings-layout="wrap">{text('clean'+clean)}</span><button data-settings-layout="row" disabled={busy} className="storage-button" onClick={()=>{void(async()=>{if(clean!=='Resources')await audio.update('clear');if(clean!=='Audio')await resources.update('clear');setClean('');})();}}>{text('confirm')}</button></div>}
            <button data-settings-layout="row" className="storage-text-button" onClick={()=>setClean('')}>{text('back')}</button>
        </div>}
        {tasks&&<AudioCacheTasks resources={r} collections={s.collections??[]} onClose={()=>setTasks(false)}/>}
    </section>;
}
