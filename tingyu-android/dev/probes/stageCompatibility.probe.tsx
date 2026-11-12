import React, { useEffect, useMemo, useState } from 'react';
import { useMotionValue } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { DAYLIGHT_THEME, DEFAULT_THEME } from '../../src/services/baseThemes';
import { useVisualizerSettingsStore } from '../../src/stores/useVisualizerSettingsStore';
import { useVisualizerTunings } from '../../src/components/visualizer/useVisualizerTunings';
import VisualizerRenderer from '../../src/components/visualizer/VisualizerRenderer';
import { getVisualizerRegistryEntry } from '../../src/components/visualizer/registry';
import type { Line } from '../../src/types';
import type { ProbeDefinition } from './definition';

// dev/probes/stageCompatibility.probe.tsx
// Real stage lifecycle and semantic settings harness; synthetic clock and spectrum only.
const lines: Line[] = Array.from({length: 80}, (_, i) => {
    const text = ['听见风吹过窗边', '雨落在城市的灯光里', '我们一起走向海边', 'Hello again 在星光下'][i % 4];
    const chars = Array.from(text);
    return { id: String(i), fullText: text, startTime: i * 4, endTime: i * 4 + 3.5,
        translation: 'The rain falls in the city', words: chars.map((text, j) => ({text, startTime: i * 4 + j * 3.5 / chars.length, endTime: i * 4 + (j + 1) * 3.5 / chars.length})) };
});
const StageCompatibility = () => {
    const {t} = useTranslation();
    const mode = useVisualizerSettingsStore(state => state.visualizerMode);
    const nebbiaTuning = useVisualizerSettingsStore(state => state.nebbiaTuning);
    const tunings = useVisualizerTunings();
    const time = useMotionValue(1), power = useMotionValue(.4);
    const bass = useMotionValue(0), lowMid = useMotionValue(0), mid = useMotionValue(0), vocal = useMotionValue(0), treble = useMotionValue(0);
    const spectrum = useMotionValue(new Uint8Array(32));
    const bands = useMemo(() => ({bass, lowMid, mid, vocal, treble, spectrum}), [bass, lowMid, mid, vocal, treble, spectrum]);
    const [paused, setPaused] = useState(false), [shown, setShown] = useState(true), [mounted, setMounted] = useState(true);
    const [day, setDay] = useState(false), [settings, setSettings] = useState(false), [song, setSong] = useState(0), [index, setIndex] = useState(0);
    const theme = day ? DAYLIGHT_THEME : DEFAULT_THEME;
    useEffect(() => {
        if (paused) return;
        let raf = 0, previous = performance.now();
        const tick = (now: number) => {
            const value = (time.get() + (now - previous) / 1000) % 320; previous = now;
            time.set(value); setIndex(Math.floor(value / 4));
            const pulse = Math.sin(value * Math.PI * 4) > .8 ? 190 : 20;
            bass.set(pulse); lowMid.set(pulse * .8); mid.set(65); vocal.set(120); treble.set(pulse * .5);
            spectrum.set(new Uint8Array(32).fill(pulse));
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [paused, bass, lowMid, mid, vocal, treble, spectrum, time]);
    return <div>
        <div data-testid="stage-host" style={{position:'fixed',inset:0,display:shown?'block':'none'}}>
            {mounted && <VisualizerRenderer mode={mode} visualizerTunings={tunings} currentTime={time} currentLineIndex={index}
                lines={lines} theme={theme} audioPower={power} audioBands={bands} paused={paused} seed={song} isDaylight={day} showText songTitle="听屿测试" songArtist="Folia" />}
        </div>
        <div style={{position:'fixed',top:0,left:0,zIndex:100,background:'#222',color:'white'}}>
            <button onClick={() => setPaused(v=>!v)}>pause</button><button onClick={() => setShown(v=>!v)}>hide</button>
            <button onClick={() => setMounted(v=>!v)}>mount</button><button onClick={() => setDay(v=>!v)}>theme</button>
            <button onClick={() => {setSong(v=>v+1);time.set(0);}}>song</button><button onClick={() => {time.set(40);setIndex(10);}}>seek</button>
            <button onClick={() => setSettings(v=>!v)}>settings</button>
        </div>
        {settings && <div data-testid="stage-settings" style={{position:'fixed',inset:'40px 0 0',overflow:'auto',background:theme.backgroundColor,color:theme.primaryColor,zIndex:99}}>
            {getVisualizerRegistryEntry(mode).renderSettingsPanel?.({t,isDaylight:day,theme,controlCardBg:theme.backgroundColor,rangeInputClass:'w-full',nebbiaTuning,
                onNebbiaTuningChange: patch => useVisualizerSettingsStore.getState().handleSetNebbiaTuning(patch)})}
        </div>}
    </div>;
};
export default { id: 'stageCompatibility', title: 'Stage compatibility', description: 'Real renderer lifecycle and settings checks', Component: StageCompatibility } satisfies ProbeDefinition;
