import { useState } from 'react';
import { navigationDiagnosticsEnabled, setNavigationDiagnostics } from '../../services/navigationTiming';
import { isAndroidNativeRuntime } from '../../utils/platform';

// src/components/modal/StartupDiagnosticsControl.tsx
export default function StartupDiagnosticsControl() {
    const [enabled,setEnabled]=useState(navigationDiagnosticsEnabled),[busy,setBusy]=useState(false),[error,setError]=useState('');
    if(!isAndroidNativeRuntime())return null;
    const toggle=async()=>{setBusy(true);setError('');try{await setNavigationDiagnostics(!enabled);setEnabled(!enabled)}catch{setError('诊断设置失败，请重试')}finally{setBusy(false)}};
    return <div className="sm:col-span-2 rounded-2xl border border-current/15 p-4" style={{color:'var(--text-primary)'}}>
        <button type="button" role="switch" aria-checked={enabled} disabled={busy} onClick={()=>void toggle()}
            className="flex min-h-12 w-full items-center justify-between gap-3 text-left">
            <span>冷启动诊断（前 10 秒）</span><span>{busy?'保存中':enabled?'已开启':'已关闭'}</span>
        </button>
        <p className="text-xs leading-6" style={{color:'var(--text-secondary)'}}>开启后从系统强行停止听屿，再重新打开并立即操作。随后回到此页点击“导出诊断数据”，分享日志即可，无需连接电脑。关闭后停止采样。</p>
        {error&&<p role="alert">{error}</p>}
    </div>;
}
