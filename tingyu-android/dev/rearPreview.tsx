import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import './../src/index.css';
import VisualizerRenderer from '../src/components/visualizer/VisualizerRenderer';
import { FALLBACK_AI_DUAL_THEME } from '../src/services/themeSanitizer';
import type { Line, VisualizerMode } from '../src/types';

// dev/rearPreview.tsx
// Local rear-panel harness: renders one lyric style at the real rear CSS size so layout bugs can be seen.
const params = new URLSearchParams(location.search);
const mode = (params.get('mode') ?? 'hanabi') as VisualizerMode;
const sample = params.get('sample') ?? 'long';
// The rear panel is a colour display: default to light lyrics on a dark backing.
const theme = { ...FALLBACK_AI_DUAL_THEME.dark, backgroundColor: '#101614', primaryColor: '#ffffff',
    secondaryColor: '#d7e3de', accentColor: '#8ff0c8',
    animationIntensity: (params.get('intensity') ?? 'normal') as 'calm' | 'normal' | 'chaotic' };
const SAMPLES: Record<string, string[]> = {
    long: ['你是无意穿堂风 偏偏孤倨引山洪', '爸妈又一起走过的老街', 'Send them your heart so they will know someone cares'],
    short: ['花火', '现在已经回不去了', '老街'],
    reported: ['会越过越好 天天念想着远方', '思念的人住在弯月亮', '在思念里等你回来'],
    cappella: ['全世界只有两个人', '愿你现在过得幸福安稳', 'May your days be filled with happiness and peace'],
    twoLayouts: ['渐渐地忘记赶不上明天', '要用力地抓紧想念', '每一朵花都在春天盛开'],
    claddagh: ['要用力地抓紧了想念', '明天再也没有你的笑脸', 'Send them your heart so they will know someone cares'],
};
const texts = SAMPLES[sample] ?? SAMPLES.long!;
const lines: Line[] = texts.map((text, index) => {
    const start = index * 10;
    return { fullText: text, startTime: start, endTime: start + 8, translation: index === 1 ? 'They walked the old street together again' : undefined,
        words: text.split('').map((char, i) => ({ text: char, startTime: start + i * 8 / text.length, endTime: start + (i + 1) * 8 / text.length })) } as Line;
});
const at = Number(params.get('line') ?? '1') % lines.length;
const line = lines[at]!;
const manual = params.get('manual') === '1';
const currentTime = motionValue(manual ? line.startTime + 2 : line.startTime - 0.4);
(window as unknown as { __rearPreview: { seek: (time: number) => void } }).__rearPreview = { seek: time => currentTime.set(time) };
// Playback advances so entry/highlight animations settle the way they do on the device.
const startedAt = performance.now();
const tick = () => {
    const elapsed = (performance.now() - startedAt) / 1000;
    currentTime.set(Math.min(line.endTime + 1, line.startTime - 0.4 + elapsed * 1.6));
    requestAnimationFrame(tick);
};
if (!manual) requestAnimationFrame(tick);
const zero = motionValue(0);
const power = motionValue(Number(params.get('power') ?? 0));
const audioBands = { bass: power, lowMid: zero, mid: zero, vocal: zero, treble: zero, spectrum: motionValue(new Uint8Array(32)) };

document.documentElement.dataset.foliaSurface = params.get('surface') === 'front' ? 'rear-lyrics' : 'rear-lyrics-panel';
document.documentElement.style.background = '#101614';
function Preview() {
    const [currentLine, setCurrentLine] = useState(at);
    useEffect(() => currentTime.on('change', time => {
        let next = 0;
        for (let index = lines.length - 1; index >= 0; index--) {
            if (lines[index]!.startTime <= time) { next = index; break; }
        }
        setCurrentLine(previous => previous === next ? previous : next);
    }), []);
    return (
    <div style={{ position: 'fixed', inset: 0 }} data-preview-mode={mode}>
        <VisualizerRenderer mode={mode} visualizerTunings={{}} currentTime={currentTime} currentLineIndex={currentLine}
            lines={lines} theme={theme} subtitleTheme={theme} isDaylight={false} audioPower={zero} audioBands={audioBands}
            songTitle="老街" songArtist="李荣浩" songAlbum="模特" coverUrl="" showText staticMode={false} paused={false}
            visualizerOpacity={1} background={{ mode: 'common', transparent: true }} lyricsFontScale={Number(params.get('fontScale') ?? 1)}
            subtitleFontScale={1} subtitleOverlayOpacity={1} subtitleOverlayBackground={false} subtitleUpcomingLyricsBlur={false}
            hideTranslationSubtitle={false} showSubtitleTranslation subtitleContentMode="both" seed="rear-preview" />
    </div>);
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview /></React.StrictMode>);
