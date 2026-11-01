import React from 'react';
import { Check, ChevronDown, CloudDownload, RefreshCw, Trash2 } from 'lucide-react';
import { isCapacitorAndroid } from '../../../platform/runtime';
import { useResourceCacheStatus, type ResourceStatus } from './useResourceCacheStatus';
import './resourceCacheSettings.css';

// src/components/modal/settings/SmartResourceCacheSettings.tsx
export default function SmartResourceCacheSettings(){
    const {status:s,busy,error,update}=useResourceCacheStatus();
    if(!isCapacitorAndroid()||!s)return null;
    return <ResourceCacheCard status={s} busy={busy} error={error} update={update}/>;
}
export function ResourceCacheCard({status:s,busy,error,update}:{status:ResourceStatus;busy:boolean;error:string;update:(action?:string,next?:Partial<ResourceStatus>)=>Promise<void>}){
    const [details,setDetails]=React.useState(false);
    const [confirm,setConfirm]=React.useState(false);
    const failures=s.failed+(s.platformFailed??0);
    const complete=s.total>0&&s.metadataComplete&&s.pending===0&&s.platformPending===0&&failures===0&&s.completed>=s.total;
    const label=!s.total?'尚未开始':complete?'已完成':!s.enabled||s.paused?'已暂停':!s.networkAllowed?'等待网络':!s.metadataComplete?'补齐歌单中':failures&&s.pending===0?'部分失败':s.jobState==='running'?'正在缓存':s.nextDue>Date.now()?'等待重试':s.jobState==='scheduled'||s.jobState==='system-stopped'?'等待系统调度':'状态待确认';
    const percent=s.total?Math.min(100,Math.max(0,s.completed/s.total*100)):0;
    const toggle=(key:'enabled'|'wifiOnly',title:string)=><div className="resource-setting"><span>{title}</span><button type="button" role="switch" aria-label={title} aria-checked={s[key]} disabled={busy} className="resource-switch" onClick={()=>void update('configure',{enabled:s.enabled,wifiOnly:s.wifiOnly,[key]:!s[key]})}><span/></button></div>;
    return <section className="resource-card" aria-label="智能资源预缓存">
        <header className="resource-heading"><span className="storage-icon"><CloudDownload size={20}/></span><div><h3>智能资源预缓存</h3><p>自动缓存歌词与封面，不下载音频</p></div><button className="storage-icon-button" aria-label="刷新缓存状态" disabled={busy} onClick={()=>void update()}><RefreshCw size={18}/></button></header>
        <div className="resource-progress">
            <div className="resource-progress-caption"><span>当前歌单</span><span className="resource-status">{complete&&<Check size={13}/>} {label}</span></div>
            <div className="resource-count"><strong>{s.completed}</strong><span>/ {s.total} 首</span></div>
            {/* Export real boxes: the native settings bridge cannot paint UA progress internals. */}
            <div className="resource-meter" role="progressbar" aria-label="当前歌单缓存进度" aria-valuenow={s.completed} aria-valuemin={0} aria-valuemax={Math.max(1,s.total)}><div style={{width:`${percent}%`}}/></div>
            {!complete&&<p className="resource-hint">{!s.total?'开始播放歌单后自动加入缓存':!s.networkAllowed?'网络允许后继续，已完成的资源会保留':!s.metadataComplete?'正在发现剩余歌曲，已缓存内容无需重下':`剩余 ${Math.max(0,s.total-s.completed)} 首${failures?` · ${failures} 项需重试`:''}`}</p>}
        </div>
        <div className="resource-settings">{toggle('enabled','自动预缓存整个歌单')}{toggle('wifiOnly','仅 Wi-Fi 缓存')}<p className="resource-hint">{s.wifiOnly?'整单缓存仅使用 Wi-Fi':'允许移动数据，遵守系统省流量限制'}</p></div>
        <div className="resource-stats">{[['共享歌词',(s.lyricsBytes/1048576).toFixed(1)+' MB'],['共享封面',(s.artworkBytes/1048576).toFixed(1)+' MB']].map(([title,value])=><div key={title}><span>{title}</span><strong>{value}</strong></div>)}</div>
        {error&&<p role="alert" className="storage-error">{error}</p>}
        <div className="resource-footer"><button className="storage-text-button" aria-expanded={details} onClick={()=>{setDetails(!details);setConfirm(false);}}>任务详情<ChevronDown size={16} style={{transform:details?'rotate(180deg)':undefined}}/></button>{!complete&&s.total>0&&<button className="storage-button" disabled={busy} onClick={()=>void update(failures?'retry':'resume')}>{failures?'重试失败项':'继续缓存'}</button>}</div>
        {details&&<div className="resource-diagnostics">
            <dl>{[['已发现歌曲',`${s.discovered} 首`],['待处理',`${s.pending} 首`],['失败 / 等待歌词增强',`${failures} / ${s.platformPending}`],['高质量 / 临时歌词',`${s.confirmedLyrics??'—'} / ${s.provisionalLyrics??'—'} 首`],['确认无词',`${s.noLyrics??'—'} 首`],['全局歌词记录',`${s.cachedSongs} 首`]].map(([title,value])=><div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}</dl>
            {confirm?<div className="resource-confirm"><p>清理可重新下载的歌词与封面。保留手动歌词、当前曲资源、歌曲文件和用户设置。</p><div className="resource-actions"><button className="storage-button" onClick={()=>setConfirm(false)}>取消</button><button className="storage-button" disabled={busy} onClick={()=>{void update('clear');setConfirm(false);}}>确认清理</button></div></div>:<button className="storage-text-button storage-danger" disabled={busy} onClick={()=>setConfirm(true)}><Trash2 size={16}/>清理可重新下载的资源</button>}
        </div>}
    </section>;
}
