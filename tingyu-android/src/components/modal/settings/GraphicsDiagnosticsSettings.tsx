import { useEffect, useState } from 'react';
import { GRAPHICS_DIAGNOSTICS, GRAPHICS_MODES, canChangeGraphicsMode, type GraphicsMode } from '../../../utils/graphicsDiagnosticsBuild';
import { applyGraphicsMode, exportGraphicsReport, graphicsPort, startGraphicsRun, stopGraphicsRun } from '../../../services/graphicsDiagnostics';

// src/components/modal/settings/GraphicsDiagnosticsSettings.tsx
// Test-only troubleshooting controls, like developer settings; never an exported appearance preference.
const labels:Record<GraphicsMode,string>={A:'A · 1.3.32 渲染策略',B:'B · 舞台不参与玻璃采样',C31:'C1 · 1.3.31 渲染策略',C_HW:'C2 · WebView 硬件层'};
export default function GraphicsDiagnosticsSettings(){
    const [mode,setMode]=useState<GraphicsMode>('A'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[observation,setObservation]=useState('');
    useEffect(()=>{if(GRAPHICS_DIAGNOSTICS)void graphicsPort.graphicsProbe().then(value=>setMode(value.mode)).catch(error=>setMessage(String(error)))},[]);
    if(!GRAPHICS_DIAGNOSTICS)return null;
    const button='min-h-9 px-3 py-2 rounded-lg border border-current/15 text-xs disabled:opacity-40';
    const run=async(action:()=>Promise<unknown>,success:string)=>{setBusy(true);try{await action();setMessage(success)}catch(error){setMessage(String(error))}finally{setBusy(false)}};
    return <section data-testid="graphics-diagnostics" className="space-y-3 border-t border-current/15 pt-3">
        <h3 className="text-sm font-semibold">歌词闪烁 · 对照诊断</h3>
        <p className="text-xs opacity-70 leading-relaxed">当前 {labels[mode]}。切换会暂停播放并重启界面；不清除账户数据。每次只允许从 A 改一个变量，其他组之间先恢复 A。</p>
        <div className="grid grid-cols-2 gap-2">{GRAPHICS_MODES.map(next=><button key={next} type="button" disabled={busy||next===mode||!canChangeGraphicsMode(mode,next)}
            className={button} onClick={()=>void run(()=>applyGraphicsMode(next),'正在重启界面')}>{labels[next]}</button>)}</div>
        <p className="text-xs opacity-60 leading-relaxed">B 保留全部歌词效果，只暂停舞台的玻璃背景采样；C1 只移除 .999 合成层；C2 只启用 WebView 硬件层，可能增加 GPU 负担，仅用于测试。C1/A 为相同测试版本内的渲染策略比较，不等同已实测历史 APK。</p>
        <button type="button" disabled={busy} className={`${button} w-full`} onClick={()=>void run(startGraphicsRun,'已开始记录 90 秒，请返回相同歌曲、样式和时间段复现')}>开始记录（90 秒）</button>
        <button type="button" className={`${button} w-full`} onClick={()=>{stopGraphicsRun(observation);setMessage('已停止，本组记录保存在本机')}}>停止并保存本组</button>
        <p className="text-xs opacity-70 leading-relaxed">复现时观察 W 和 N：W 是 WebView 固定标记，N 是独立原生标记。看到闪烁可点击任一个“记闪烁”，同时录屏。采样不会自动判定 GPU 根因。</p>
        <label className="block text-xs">本组观察结果
            <select className={`${button} w-full mt-2 bg-[#10231c]`} value={observation} onChange={e=>setObservation(e.target.value)}>
                <option value="">尚未判断</option><option>只有歌词闪烁，W 和 N 都正常</option><option>W 也消失，N 正常</option><option>N 也异常</option><option>本组未复现</option>
            </select>
        </label>
        <button type="button" disabled={busy} className={`${button} w-full`} onClick={()=>void run(()=>exportGraphicsReport(observation),'已打开日志分享面板')}>导出全部对照日志</button>
        {message&&<p role="status" className="text-xs leading-relaxed">{message}</p>}
    </section>;
}
