import '../../src/components/modal/settings/mobileSettings.css';
import React, { useEffect } from 'react';
import { DEFAULT_THEME } from '../../src/services/baseThemes';
import { useRearStageAppearanceStore } from '../../src/stores/useRearStageAppearanceStore';
import RearStageAppearancePage from '../../src/components/modal/settings/RearStageAppearancePage';
import type { ObsBrowserSourceConfig } from '../../src/types/obsBrowserSource';
import type { ProbeDefinition } from './definition';

// dev/probes/rearRandomRepairs.probe.tsx
function RearRandomRepairs() {
    useEffect(() => {
        const state = useRearStageAppearanceStore.getState();
        state.observeFront({ theme: DEFAULT_THEME, visualizerMode: 'classic', isDaylight: false, visualizerFrameRate: 60,
            lyricsFontScale: 1, subtitleFontScale: 1, staticMode: true, playbackSongKey: 'qa:current', hasTrack: true,
        } as ObsBrowserSourceConfig, null);
        void state.initialize();
    }, []);
    return <main data-mobile-settings="true" style={{ minHeight: '100vh', background: '#e8eee4', color: '#122e24', padding: '20px 18px', '--text-primary': '#122e24', '--text-secondary': '#52685b' } as React.CSSProperties}>
        <h1 style={{ fontSize: 24, marginBottom: 24 }}>背屏外观</h1>
        <RearStageAppearancePage page="appearance" open={() => {}}/>
    </main>;
}
const probe: ProbeDefinition = { id: 'rearRandomRepairs', title: '背屏独立随机样式',
    description: '独立外观的随机开关和候选范围只修改背屏配置', Component: RearRandomRepairs };
export default probe;
