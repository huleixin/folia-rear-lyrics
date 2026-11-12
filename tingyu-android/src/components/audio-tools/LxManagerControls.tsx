import { useState } from 'react';
import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
import { loadLxScriptUrl } from '../../services/lxSource/management';
import { noteLx, redactLx } from '../../services/lxSource/diagnostics';
import type { LxScript } from '../../services/lxSource/contract';

// src/components/audio-tools/LxManagerControls.tsx
export default function LxManagerControls({busy,onInstall,onError,onBusyChange}:{busy:boolean;onInstall:(script:Omit<LxScript,'capabilities'>)=>Promise<void>;onError:(text:string)=>void;onBusyChange:(busy:boolean)=>void}) {
    const [url,setUrl]=useState(''),[loading,setLoading]=useState(false);
    const policy=useLxSourceStore(s=>s.policy),setPolicy=useLxSourceStore(s=>s.setPolicy);
    const scripts=useLxSourceStore(s=>s.scripts),activeId=useLxSourceStore(s=>s.activeId);
    const sources=policy.priority.filter(source=>scripts.find(s=>s.id===activeId)?.capabilities[source]);
    const quality=useAudioSettingsStore(s=>s.audioQuality);
    const download=async()=>{setLoading(true);onBusyChange(true);try{await onInstall(await loadLxScriptUrl(url));}catch(error){noteLx('url-import','import',error);onError(redactLx(error));}finally{setLoading(false);onBusyChange(false);}};
    return <div className="ty-lx-controls" data-settings-layout="column" data-settings-style='{"gap":10}'>
        <label data-settings-layout="column" data-settings-style='{"gap":6}'>网络音源地址<input type="text" aria-label="网络音源地址" placeholder="https://example.com/source.js" value={url} onChange={e=>setUrl(e.target.value)} disabled={busy||loading}/></label>
        <button type="button" disabled={busy||loading||!url.trim()} onClick={()=>void download()}>从 URL 导入</button>
        <details data-settings-layout="column" data-settings-style='{"gap":8}'><summary>音质与换源策略</summary><div className="ty-lx-policy" data-settings-layout="column" data-settings-style='{"gap":10}'>
            <label data-settings-layout="column" data-settings-style='{"gap":6}'>默认音质<select aria-label="默认音质" disabled={busy} value={quality} onChange={e=>useAudioSettingsStore.getState().setAudioQuality(e.target.value as typeof quality)}>{(['standard','high','lossless','hires'] as const).map((value,i)=><option key={value} value={value}>{['128k','320k','FLAC','FLAC 24bit'][i]}</option>)}</select></label>
            <button type="button" disabled={busy} aria-pressed={policy.autoDowngrade} onClick={()=>setPolicy({autoDowngrade:!policy.autoDowngrade})}>自动音质降级：{policy.autoDowngrade?'开':'关'}</button>
            <button type="button" disabled={busy} aria-pressed={policy.autoSwitch} onClick={()=>setPolicy({autoSwitch:!policy.autoSwitch})}>匹配后自动换源：{policy.autoSwitch?'开':'关'}</button>
            <button type="button" disabled={busy} onClick={()=>setPolicy({retries:policy.retries?0:1})}>同来源重试：{policy.retries} 次</button>
            <label data-settings-layout="column" data-settings-style='{"gap":6}'>默认播放来源<select aria-label="默认播放来源" disabled={busy} value={policy.preferredSource||''} onChange={e=>setPolicy({preferredSource:e.target.value||null})}><option value="">跟随歌曲所属平台</option>{sources.map(source=><option key={source} value={source}>{source}</option>)}{policy.preferredSource&&!sources.includes(policy.preferredSource)&&<option value={policy.preferredSource}>{policy.preferredSource}（当前音源不支持）</option>}</select></label>
            <p>跨平台优先级：{policy.priority.join(' → ')}。优先使用歌曲所属平台；未匹配成功不会复用其他平台的 ID。</p>
            <div className="ty-lx-priority" data-settings-layout="wrap" data-settings-style='{"gap":7}'>{policy.priority.map(source=><button key={source} type="button" disabled={busy} onClick={()=>setPolicy({priority:[source,...policy.priority.filter(s=>s!==source)]})}>优先 {source}</button>)}</div>
            <p>后台原生续播支持同平台降级；跨平台检索需要前台可用。失败后可更换音源或恢复原音源。</p>
        </div></details>
        <button type="button" onClick={()=>{void import('../../utils/buildDiagnosticReport').then(async({buildDiagnosticReport})=>{const {exportDiagnosticReport}=await import('../../services/exportDiagnosticReport');await exportDiagnosticReport(await buildDiagnosticReport(),'听屿洛雪诊断');}).catch(error=>onError(redactLx(error)));}}>导出诊断日志</button>
    </div>;
}
