import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ThemedDialog from '../shared/ThemedDialog';
import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { useSettingsModalStore } from '../../stores/useSettingsModalStore';

// src/components/audio-tools/LxRiskDialog.tsx
export const LX_RISK_BODY='此功能属于实验性扩展，第三方音源并非由听屿提供或维护，可能出现歌曲无法播放、加载缓慢、播放中断及音源失效等情况，无法保证其稳定性及长期可用性。请仅导入可信且有权使用的音源脚本。';
export default function LxRiskDialog({isDaylight}:{isDaylight:boolean}) {
    const consent=useLxSourceStore(s=>s.consent);
    const settingsOpen=useSettingsModalStore(s=>s.settingsModalState.isOpen);
    const [error,setError]=useState('');
    useEffect(()=>{setError('');},[consent?.kind]);
    useEffect(()=>{if(!settingsOpen)useLxSourceStore.getState().cancelConsent();},[settingsOpen]);
    if(!consent)return null;
    const state=useLxSourceStore.getState();
    return createPortal(<ThemedDialog isOpen isDaylight={isDaylight} title="实验性功能提醒" onClose={state.cancelConsent}
        footer={<><button type="button" onClick={state.cancelConsent}>取消</button><button type="button" disabled={!consent.checked} onClick={()=>{try{state.confirmConsent();}catch{setError('保存失败，请检查存储空间后重试');}}}>继续</button></>}>
        <div data-settings-layout="column" data-settings-style='{"gap":16}'>
            <p data-settings-layout="wrap">{LX_RISK_BODY}</p>
            <label data-settings-layout="row" data-settings-style='{"gap":10,"minHeight":48,"align":"center"}'><input type="checkbox" checked={consent.checked} onChange={event=>state.setConsentChecked(event.target.checked)}/>我已了解上述风险，仍然选择使用</label>
            {error&&<p role="alert">{error}</p>}
        </div>
    </ThemedDialog>,document.body);
}
