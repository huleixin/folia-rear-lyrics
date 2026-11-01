import React from 'react';
import { CloudDownload, RefreshCw, Trash2 } from 'lucide-react';
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
    const [confirm,setConfirm]=React.useState(false);
    const failures=s.failed+(s.platformFailed??0);
    const label=!s.total?'尚未开始':!s.enabled||s.paused?'已暂停':!s.networkAllowed?'等待网络':!s.metadataComplete?'等待补齐歌单目录':s.pending===0&&s.platformPending===0&&s.failed===0?'已完成':failures&&s.pending===0?'部分失败，可重试':s.jobState==='running'?'正在缓存':s.nextDue>Date.now()?'等待重试或限流恢复':s.jobState==='scheduled'||s.jobState==='system-stopped'?'等待系统调度':'状态待确认';
    const toggle=(key:'enabled'|'wifiOnly',title:string,description:string)=><div className="resource-setting"><div><div>{title}</div><small>{description}</small></div><button type="button" role="switch" aria-label={title} aria-checked={s[key]} disabled={busy} className="resource-switch" onClick={()=>void update('configure',{enabled:s.enabled,wifiOnly:s.wifiOnly,[key]:!s[key]})}><span/></button></div>;
    return <section className="resource-card">
        <div className="resource-title"><CloudDownload size={22}/><h3>智能资源预缓存</h3></div>
        <p className="resource-secondary">自动缓存歌单歌词与封面，不下载音频</p>
        {toggle('enabled','自动预缓存整个歌单','按系统允许的节奏持续处理')}
        {toggle('wifiOnly','仅 Wi-Fi 缓存','关闭时允许移动数据，遵守系统省流量限制')}
        <div className="resource-progress"><div><strong>{label}</strong><span>{s.completed} / {s.total} 首</span></div>
            <progress aria-label="当前歌单缓存进度" value={s.completed} max={Math.max(1,s.total)} style={{width:'100%'}}/>
            <small>已发现 {s.discovered} 首 · 待处理 {s.pending} · 失败 {s.failed} · 等待歌词增强 {s.platformPending}</small>
        </div>
        {s.confirmedLyrics!==undefined&&<p className="resource-secondary">确认歌词 {s.confirmedLyrics} 首 · 临时歌词 {s.provisionalLyrics??0} 首 · 确认无词 {s.noLyrics??0} 首</p>}
        <div className="resource-stats">{[['歌词缓存',(s.lyricsBytes/1048576).toFixed(1)+' MB'],['封面缓存',(s.artworkBytes/1048576).toFixed(1)+' MB'],['全局歌词记录',s.cachedSongs+' 首'],['当前歌单',s.completed+' 首完成']].map(([title,value])=><div key={title}><small>{title}</small><strong>{value}</strong></div>)}</div>
        {error&&<p role="alert">{error}</p>}
        <div className="resource-actions"><button disabled={busy} onClick={()=>void update()}><RefreshCw size={16}/>刷新状态</button><button disabled={busy} onClick={()=>void update(failures?'retry':'resume')}>{failures?'重试失败项':'继续缓存'}</button></div>
        {confirm?<div className="resource-confirm"><p>清理可重新下载的歌词与封面缓存。保留手动歌词、当前曲资源、歌曲文件和用户设置。</p><div className="resource-actions"><button onClick={()=>setConfirm(false)}>取消</button><button disabled={busy} onClick={()=>{void update('clear');setConfirm(false);}}>确认清理</button></div></div>:<button className="resource-clear" disabled={busy} onClick={()=>setConfirm(true)}><Trash2 size={16}/>清理可重新下载的资源</button>}
    </section>;
}
