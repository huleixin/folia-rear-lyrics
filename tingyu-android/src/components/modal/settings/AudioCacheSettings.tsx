import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Download} from 'lucide-react';
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
        {switchRow('wifiOnly')}
        <div data-settings-layout="column" data-settings-style='{"gap":8}'><span data-settings-layout="wrap">{text('limit')}</span><div data-settings-layout="grid" data-settings-style='{"columns":4,"gap":8}'>{[1,2,4,8].map(value=><button key={value} disabled={busy} aria-pressed={s.limitGb===value} className="storage-button" data-settings-layout="row" data-settings-style={JSON.stringify({center:true,minHeight:44,radius:12,border:true,fill:s.limitGb===value,tone:s.limitGb===value?'accent':'muted'})} onClick={()=>void update({limitGb:value})}>{value} GB</button>)}</div></div>
        <div data-settings-layout="column" data-settings-style='{"gap":8}'><strong data-settings-layout="wrap">{text('audio')} · {t('audioCache.usage',{count:s.cached,size:(s.bytes/1048576).toFixed(1)})}</strong><span data-settings-layout="wrap">{text('resources')} · {((r.lyricsBytes+r.artworkBytes)/1048576).toFixed(1)} MB</span></div>
        <div data-settings-layout="column" data-settings-style='{"gap":8}'>
            <span data-settings-layout="wrap">{t('audioCache.overview',{complete:s.complete,pending:s.pending+s.running,failed:s.failed})}</span>
            <span data-settings-layout="wrap">{t('audioCache.resourceProgress',{complete:r.completed,total:r.total})}</span>
            {s.tasks.filter(task=>task.state==='running').slice(0,1).map(task=><span key={task.title} data-settings-layout="wrap">{text('state.running')}：{task.title} · {(task.bytes/1048576).toFixed(1)} MB</span>)}
            {hasWork&&paused&&<span data-settings-layout="wrap">{text('paused')}</span>}
            {!s.networkAllowed&&s.pending+s.running>0&&<span data-settings-layout="wrap">{text('waiting')}</span>}
            {s.incompleteCatalogs>0&&<p className="resource-hint" data-settings-layout="wrap">{text('catalog')}</p>}
            {s.stale>0&&<p className="resource-hint" data-settings-layout="wrap">{text('staleHint')}</p>}
        </div>
        {(audio.error||resources.error)&&<p role="alert" data-settings-layout="wrap">{text('error')}</p>}
        <div data-settings-layout="wrap" data-settings-style='{"gap":8}'>
            <button className="storage-button" data-settings-layout="row" disabled={busy} onClick={()=>setTasks(true)}>{text('tasks')}</button>
            {hasWork&&<button className="storage-text-button" data-settings-layout="row" disabled={busy} onClick={()=>void control(paused?'resume':'pause')}>{text(paused?'resume':'pause')}</button>}
            {(s.failed>0||r.failed>0||(r.platformFailed??0)>0)&&<button className="storage-text-button" data-settings-layout="row" disabled={busy} onClick={()=>void control('retry')}>{text('retry')}</button>}
            <button className="storage-text-button" data-settings-layout="row" disabled={busy} onClick={()=>setClean(clean?'':'choose')}>{text('clean')}</button>
        </div>
        {clean&&<div data-settings-layout="column" data-settings-style='{"gap":10}'>
            <p className="resource-hint" data-settings-layout="wrap">{text('cleanHint')}</p>
            {clean==='choose'?<div data-settings-layout="wrap" data-settings-style='{"gap":8}'>{['Audio','Resources','All'].map(kind=><button key={kind} data-settings-layout="row" className="storage-text-button" onClick={()=>setClean(kind)}>{text('clean'+kind)}</button>)}</div>:<div data-settings-layout="wrap" data-settings-style='{"gap":8}'><span data-settings-layout="wrap">{text('clean'+clean)}</span><button data-settings-layout="row" disabled={busy} className="storage-button" onClick={()=>{void(async()=>{if(clean!=='Resources')await audio.update('clear');if(clean!=='Audio')await resources.update('clear');setClean('');})();}}>{text('confirm')}</button></div>}
            <button data-settings-layout="row" className="storage-text-button" onClick={()=>setClean('')}>{text('back')}</button>
        </div>}
        <p className="resource-hint" data-settings-layout="wrap">{text('resourceHint')}</p>
        {tasks&&<AudioCacheTasks resources={r} collections={s.collections??[]} onClose={()=>setTasks(false)}/>}
    </section>;
}
