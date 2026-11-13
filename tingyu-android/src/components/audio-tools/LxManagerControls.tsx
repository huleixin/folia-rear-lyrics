import { useEffect, useState } from 'react';
import { Download, FileWarning, RotateCcw } from 'lucide-react';
import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
import { loadLxScriptUrl } from '../../services/lxSource/management';
import { noteLx, redactLx } from '../../services/lxSource/diagnostics';
import type { LxScript } from '../../services/lxSource/contract';

// src/components/audio-tools/LxManagerControls.tsx
export const LX_PLATFORM_LABELS: Record<string,string>={kw:'酷我音乐',tx:'QQ音乐',wy:'网易云音乐',kg:'酷狗音乐',mg:'咪咕音乐',local:'本地音乐'};
export const lxPlatformLabel=(source:string)=>LX_PLATFORM_LABELS[source]??source;

export default function LxManagerControls({busy,onInstall,onError,onBusyChange,selected,onSelect}:{busy:boolean;onInstall:(script:Omit<LxScript,'capabilities'>,activate:boolean)=>Promise<void>;onError:(text:string)=>void;onBusyChange:(busy:boolean)=>void;selected:LxScript|null;onSelect:(script:LxScript)=>void}) {
    const [url,setUrl]=useState(''),[loading,setLoading]=useState(false),[updateUrl,setUpdateUrl]=useState('');
    const [checking,setChecking]=useState(false),[candidate,setCandidate]=useState<Omit<LxScript,'capabilities'>|null>(null),[updateMessage,setUpdateMessage]=useState('');
    const policy=useLxSourceStore(s=>s.policy),setPolicy=useLxSourceStore(s=>s.setPolicy),setImportUrl=useLxSourceStore(s=>s.setImportUrl);
    const scripts=useLxSourceStore(s=>s.scripts),activeId=useLxSourceStore(s=>s.activeId);
    const active=scripts.find(s=>s.id===activeId);
    const available=policy.priority.filter(source=>selected?.capabilities[source]);
    const quality=useAudioSettingsStore(s=>s.audioQuality);
    useEffect(()=>setUpdateUrl(selected?.importUrl??''),[selected?.id,selected?.importUrl]);
    const download=async()=>{setLoading(true);onBusyChange(true);try{await onInstall(await loadLxScriptUrl(url),true);}catch(error){noteLx('url-import','import',error);onError(redactLx(error));}finally{setLoading(false);onBusyChange(false);}};
    const bind=()=>{if(!selected)return;try{setImportUrl(selected.id,updateUrl);setUpdateMessage(updateUrl.trim()?'已绑定更新地址':'已清除更新地址');onSelect(useLxSourceStore.getState().scripts.find(s=>s.id===selected.id)!);}catch(error){const text=redactLx(error);setUpdateMessage(text);onError(text);}};
    const checkUpdate=async()=>{if(!selected?.importUrl)return;setChecking(true);setCandidate(null);setUpdateMessage('');onBusyChange(true);try{const next=await loadLxScriptUrl(selected.importUrl);if(next.name!==selected.name)throw Error('更新脚本名称与原音源不一致，请重新导入');
        if(next.code===selected.code){setUpdateMessage('已是最新版本');return;}setCandidate({...next,id:selected.id});setUpdateMessage(`发现新版本：${selected.version||'未知版本'} → ${next.version||'未知版本'}`);
    }catch(error){noteLx('update-check','import',error);setUpdateMessage(redactLx(error));onError(redactLx(error));}finally{setChecking(false);onBusyChange(false);}};
    return <div className="ty-lx-controls" data-settings-layout="column" data-settings-style='{"gap":16}'>
        <section className="ty-lx-section" data-settings-layout="column" data-settings-style='{"gap":10}' aria-labelledby="lx-update-heading">
            <h3 id="lx-update-heading" className="ty-lx-section-title">更新与来源</h3>
            <label className="ty-lx-field" data-settings-layout="column" data-settings-style='{"gap":6}'>网络音源地址<input type="text" inputMode="url" aria-label="网络音源地址" placeholder="https://example.com/source.js" value={url} onChange={e=>setUrl(e.target.value)} disabled={busy||loading}/></label>
            <button type="button" className="ty-lx-primary-action" disabled={busy||loading||!url.trim()} onClick={()=>void download()}><Download size={16}/>{loading?'正在下载…':'从 URL 导入'}</button>
            {selected&&<div className="ty-lx-update-card" data-settings-layout="column" data-settings-style='{"gap":10}'>
                <div className="ty-lx-update-title"><strong>{selected.name}</strong><small>{selected.version||'未标版本'} · {selected.importUrl?'已绑定更新地址':'本地导入'}</small></div>
                <label className="ty-lx-field" data-settings-layout="column" data-settings-style='{"gap":6}'>更新地址<input type="url" inputMode="url" aria-label="更新地址" placeholder="https://example.com/source.js" value={updateUrl} onChange={e=>setUpdateUrl(e.target.value)} disabled={busy}/></label>
                <div className="ty-lx-update-actions" data-settings-layout="wrap" data-settings-style='{"gap":8}'>
                    <button type="button" disabled={busy} onClick={bind}>保存更新地址</button>
                    {selected.importUrl&&<button type="button" disabled={busy||checking} onClick={()=>void checkUpdate()}>{checking?'正在检查…':'检查更新'}</button>}
                    {candidate&&<button type="button" className="ty-lx-primary-action" disabled={busy} onClick={()=>{const activeUpdate=selected.id===activeId;void onInstall(candidate,activeUpdate);setCandidate(null);setUpdateMessage('更新已安装，可回退上一版');}}>安装更新</button>}
                    {selected.previous&&<button type="button" disabled={busy} onClick={()=>{useLxSourceStore.getState().rollback(selected.id);onSelect(useLxSourceStore.getState().scripts.find(s=>s.id===selected.id)!);setCandidate(null);setUpdateMessage('已回退上一版');}}><RotateCcw size={14}/>回退上一版</button>}
                </div>
                {updateMessage&&<p className="ty-lx-update-message" role={/失败|不一致|不能/.test(updateMessage)?'alert':undefined}>{updateMessage}</p>}
            </div>}
            <p className="ty-lx-help-copy"><FileWarning size={14}/>更新需要音源提供更新地址。脚本提示有更新时，可复制其地址绑定到这里；安装前会验证脚本，失败不会替换当前版本。</p>
        </section>
        <details className="ty-lx-policy-section" data-settings-layout="column" data-settings-style='{"gap":12}'><summary>播放与换源设置</summary><div className="ty-lx-policy" data-settings-layout="column" data-settings-style='{"gap":14}'>
            <label className="ty-lx-field" data-settings-layout="column" data-settings-style='{"gap":6}'>默认音质<select aria-label="默认音质" disabled={busy} value={quality} onChange={e=>useAudioSettingsStore.getState().setAudioQuality(e.target.value as typeof quality)}>{(['standard','high','lossless','hires'] as const).map((value,i)=><option key={value} value={value}>{['标准 128k','高品质 320k','无损 FLAC','Hi-Res FLAC 24bit'][i]}</option>)}</select></label>
            <label className="ty-lx-field" data-settings-layout="column" data-settings-style='{"gap":6}'>默认播放来源<select aria-label="默认播放来源" disabled={busy} value={policy.preferredSource||''} onChange={e=>setPolicy({preferredSource:e.target.value||null})}><option value="">跟随歌曲所属平台</option>{available.map(source=><option key={source} value={source}>{lxPlatformLabel(source)}</option>)}{policy.preferredSource&&!available.includes(policy.preferredSource)&&<option value={policy.preferredSource}>{lxPlatformLabel(policy.preferredSource)}（当前音源不支持）</option>}</select></label>
            <div className="ty-lx-setting-row"><span><strong>自动音质降级</strong><small>请求音质失败时，尝试脚本声明的较低音质</small></span><button type="button" role="switch" aria-label="自动音质降级" aria-checked={policy.autoDowngrade} disabled={busy} onClick={()=>setPolicy({autoDowngrade:!policy.autoDowngrade})}><i/></button></div>
            <div className="ty-lx-setting-row"><span><strong>匹配后自动换源</strong><small>按歌名、歌手和时长匹配后，使用其他可用平台</small></span><button type="button" role="switch" aria-label="匹配后自动换源" aria-checked={policy.autoSwitch} disabled={busy} onClick={()=>setPolicy({autoSwitch:!policy.autoSwitch})}><i/></button></div>
            <label className="ty-lx-field" data-settings-layout="column" data-settings-style='{"gap":6}'>同来源重试次数<select aria-label="同来源重试次数" disabled={busy} value={policy.retries} onChange={e=>setPolicy({retries:Number(e.target.value)})}><option value="0">不重试</option><option value="1">重试一次</option></select></label>
            <div className="ty-lx-order" data-native-order={JSON.stringify(policy.priority)} aria-label="跨平台换源优先级" data-settings-layout="column" data-settings-style='{"gap":6}'><span className="ty-lx-field-title">跨平台换源优先级</span>{policy.priority.map((source,index)=><div className="ty-lx-order-row" key={source}><b>{index+1}</b><span>{lxPlatformLabel(source)}</span><small>{source}</small>{index>0&&<button type="button" disabled={busy} aria-label={`上移${lxPlatformLabel(source)}`} onClick={()=>{const next=[...policy.priority];[next[index-1],next[index]]=[next[index],next[index-1]];setPolicy({priority:next});}}>上移</button>}</div>)}</div>
            <p className="ty-lx-help-copy">歌曲先使用所属平台。换源只使用重新匹配到的歌曲信息；后台原生续播目前支持同平台降级。</p>
        </div></details>
        <button type="button" className="ty-lx-diagnostic-action" onClick={()=>{void import('../../utils/buildDiagnosticReport').then(async({buildDiagnosticReport})=>{const {exportDiagnosticReport}=await import('../../services/exportDiagnosticReport');await exportDiagnosticReport(await buildDiagnosticReport(),'听屿洛雪诊断');}).catch(error=>onError(redactLx(error)));}}>导出诊断日志</button>
    </div>;
}
