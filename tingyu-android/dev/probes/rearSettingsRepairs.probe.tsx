import '../../src/components/modal/settings/mobileSettings.css';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import RearControlView from '../../src/components/modal/settings/RearControlView';
import { buildRearControlPage } from '../../src/components/modal/settings/rearControlModel';
import type { RearLyricsStatus } from '../../src/services/rearLyricsControl';
import type { ProbeDefinition } from './definition';

// dev/probes/rearSettingsRepairs.probe.tsx
function RearSettingsRepairs() {
    const { t } = useTranslation();
    const [snapshot, setSnapshot] = useState<RearLyricsStatus>({ backendMode: 'lsp', nativeCardAod: true,
        nativeCardKeepAwake: false, nativeCardKeepAwakeAvailable: true, lspConnected: true, rearDisplayId: 1, build: 255 });
    const model = buildRearControlPage('advanced', { snapshot, available: true, busy: false, failed: false, actionFailed: false }, t);
    return <main data-mobile-settings="true" style={{ minHeight: '100vh', background: '#e8eee4', color: '#122e24', padding: '20px 18px', '--text-primary': '#122e24', '--text-secondary': '#52685b' } as React.CSSProperties}>
        <h1 style={{ fontSize: 24, marginBottom: 24 }}>高级设置</h1>
        <RearControlView model={model} actions={{
            'rear:aod': () => setSnapshot(s => ({ ...s, nativeCardAod: !s.nativeCardAod })),
            'rear:keep-awake': () => setSnapshot(s => ({ ...s, nativeCardKeepAwake: !s.nativeCardKeepAwake })),
        }}/>
        <button onClick={() => setSnapshot(s => ({ ...s, nativeCardKeepAwakeAvailable: false }))}>模拟框架断开</button>
    </main>;
}
const probe: ProbeDefinition = { id: 'rearSettingsRepairs', title: '背屏卡片显示开关',
    description: 'AOD 与背屏常亮独立切换、状态反馈及框架失联后的关闭行为', Component: RearSettingsRepairs };
export default probe;
