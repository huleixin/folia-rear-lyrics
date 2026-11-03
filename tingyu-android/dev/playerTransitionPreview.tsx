import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import './../src/index.css';
import './../src/i18n/config';
import MinimalStage from '../src/components/app/overlays/minimal-stage/MinimalStage';
import MobileStageChrome from '../src/components/app/overlays/mobile-stage/MobileStageChrome';
import type { AppOverlaysModel } from '../src/components/app/overlays/buildAppOverlaysModel';
import { lyricCurrentTime, currentTime } from '../src/stores/motionSignals';
import { usePlaybackStore } from '../src/stores/usePlaybackStore';
import { useAppViewStore } from '../src/stores/useAppViewStore';
import { useTypographySettingsStore } from '../src/stores/useTypographySettingsStore';
import { usePlayerViewModeStore, type MinimalPlayerPage } from '../src/stores/usePlayerViewModeStore';
import { FALLBACK_AI_DUAL_THEME } from '../src/services/themeSanitizer';
import { PlayerState, type Line } from '../src/types';

// dev/playerTransitionPreview.tsx
// The two full-screen player surfaces on one page, driven by the real components and the real view
// store, so the paired fade between them can be recorded frame by frame.
//
// What this harness can prove: which layer is on top at each moment, that the minimal page does not
// climb out of the bottom edge on the way back from the stage, that neither surface is missing when
// the other is half transparent, that a double tap cannot mount two of either, and that the page the
// listener left is the page they come back to.
// What it cannot: the native Compose control bar (no bridge here, so the React transport renders
// instead), Media3, and real frame pacing.

const params = new URLSearchParams(location.search);
const page = (params.get('page') === 'cover' ? 'cover' : 'lyrics') as MinimalPlayerPage;
const light = params.get('theme') === 'light';
const paused = params.get('paused') === '1';
const stationary = params.get('stationary') === '1';

const SONG = { name: '红玫瑰', artist: '陈奕迅', cover: '/dev/assets/minimal-preview-cover.jpg' };

const LINES = [
    '红玫瑰 - 陈奕迅 (Eason Chan)',
    '词：李焯雄',
    '曲：梁翘柏',
    '编曲：梁翘柏',
    '梦里梦到醒不来的梦',
    '红线里被软禁的红',
    '所有刺激剩下疲乏的痛',
    '再无动于衷',
    '从背后抱你的时候',
    '期待的却是他的面容',
];
const LINE_SECONDS = 6;
const lyrics = {
    isWordByWord: false,
    lines: LINES.map((text, index) => ({
        fullText: text,
        startTime: index * LINE_SECONDS,
        endTime: (index + 1) * LINE_SECONDS - 0.2,
        words: [],
    })) as Line[],
};

const DEMO_TIME = 4 * LINE_SECONDS + 1.2;
const startedAt = performance.now();
const theme = light ? FALLBACK_AI_DUAL_THEME.light : FALLBACK_AI_DUAL_THEME.dark;
const duration = 239;

usePlaybackStore.setState({
    currentSong: {
        id: 'preview',
        name: SONG.name,
        artists: [{ id: 'a', name: SONG.artist }],
        album: { id: 'al', name: 'What\'s Going On…?' },
        durationMs: duration * 1000,
        catalogAudioSpecs: ['lossless'],
    } as never,
    audioSrc: '/dev/assets/preview.flac',
    duration,
    playerState: paused ? PlayerState.PAUSED : PlayerState.PLAYING,
    lyrics,
});
useTypographySettingsStore.setState({ lyricsFontScale: 1 });
usePlayerViewModeStore.setState({ mode: 'minimal', page, detour: false, stageTransition: 'idle' });

const seekLog: number[] = [];
const backLog: string[] = [];

const tick = () => {
    const elapsed = (performance.now() - startedAt) / 1000;
    const at = stationary ? DEMO_TIME : (DEMO_TIME + elapsed) % (LINE_SECONDS * LINES.length);
    currentTime.set(at);
    lyricCurrentTime.set(at);
    if (!stationary) {
        requestAnimationFrame(tick);
    }
};
currentTime.set(DEMO_TIME);
lyricCurrentTime.set(DEMO_TIME);

const noop = () => { };

const controls = {
    controlsDisabled: false,
    canTogglePlay: true,
    currentTime,
    lyricCurrentTime,
    duration,
    playerState: paused ? PlayerState.PAUSED : PlayerState.PLAYING,
    loopMode: 'off',
    shuffleEnabled: false,
    currentView: 'player',
    audioSrc: '/dev/assets/preview.flac',
    lyrics,
    isDaylight: light,
    theme,
    isHidden: false,
    hideControlBar: false,
    noTrackText: '未在播放',
    primaryColor: '#fff',
    secondaryColor: '#ccc',
    onSeek: (time: number) => {
        seekLog.push(time);
        currentTime.set(time);
        lyricCurrentTime.set(time);
    },
    onTogglePlay: noop,
    onToggleLoop: noop,
    onNavigateToPlayer: noop,
    onFocusLatticeCurrentSong: noop,
    onCommitBottomBarOffset: noop,
    slotContext: { isLiked: false, likeDisabled: false, onLike: noop },
    trackNavigation: {
        currentTrackKey: 'preview',
        onPrev: noop,
        onNext: noop,
        canPrev: true,
        canNext: true,
        prevTitle: '上一首',
        nextTitle: '下一首',
        prevLabel: '上一首',
        nextLabel: '下一首',
    },
} as unknown as NonNullable<AppOverlaysModel['floatingControls']>;

const chrome: NonNullable<AppOverlaysModel['mobileStage']> = {
    song: { title: SONG.name, artist: SONG.artist, coverUrl: SONG.cover },
    // The real one is navigateBackFromPlayer, which leaves the player; the store's detour flag is
    // what decides between that and returning to the minimal page (useAppNavigation).
    onBack: () => {
        const view = usePlayerViewModeStore.getState();
        backLog.push(view.detour ? 'detour' : 'leave');
        if (view.detour) {
            view.closeStage();
        }
    },
    hidden: false,
};

document.documentElement.dataset.foliaSurface = 'rear-lyrics';
document.documentElement.style.background = light ? '#eef3ef' : '#071312';

const SAFE_TOP = 40;
const SAFE_BOTTOM = 24;

/**
 * The stage's own background. In the app this is the visualizer canvas, which draws over the whole
 * surface; a flat, unmistakable colour stands in for it, so a frame either shows the stage or it
 * does not, and a half-dissolved frame shows both.
 */
function StageSurface() {
    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 60,
                background: 'radial-gradient(120% 80% at 50% 30%, #2c1f3f 0%, #120d1c 70%)',
                color: '#f4eee6', fontFamily: 'system-ui, sans-serif',
            }}
            data-testid="stage-surface"
        >
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 44, letterSpacing: 8, opacity: 0.22 }}>
                歌词舞台
            </div>
        </div>
    );
}

function Preview() {
    const mode = usePlayerViewModeStore(state => state.mode);
    const detour = usePlayerViewModeStore(state => state.detour);
    const stageTransition = usePlayerViewModeStore(state => state.stageTransition);
    useEffect(() => { tick(); }, []);
    useEffect(() => {
        const root = document.documentElement.style;
        root.setProperty('--folia-main-inset-top', `${SAFE_TOP}px`);
        root.setProperty('--folia-main-inset-bottom', `${SAFE_BOTTOM}px`);
        root.setProperty('--folia-main-inset-left', '0px');
        root.setProperty('--folia-main-inset-right', '0px');
    }, []);
    const stageOn = mode === 'stage' || detour || stageTransition === 'to-minimal';
    const minimalOn = mode === 'minimal' && (!detour || stageTransition === 'to-stage');
    return (
        <>
            {stageOn && <StageSurface />}
            {stageOn && <MobileStageChrome chrome={chrome} controls={controls} />}
            {minimalOn && <MinimalStage chrome={chrome} controls={controls} />}
        </>
    );
}

createRoot(document.getElementById('root')!).render(<Preview />);

type PreviewState = {
    openStage: () => void;
    closeStage: () => void;
    back: () => void;
    setMode: (mode: 'minimal' | 'stage') => void;
    state: () => {
        mode: string;
        detour: boolean;
        stageTransition: string;
        page: string;
        pos: number;
        phase: string;
        backs: string[];
        counts: { minimal: number; stage: number };
        panel: { open: boolean; tab: string };
        transform: string;
        viewport: { w: number; h: number };
    };
};
(window as unknown as { __stagePreview: PreviewState }).__stagePreview = {
    openStage: () => usePlayerViewModeStore.getState().openStage(),
    closeStage: () => usePlayerViewModeStore.getState().closeStage(),
    back: () => chrome.onBack(),
    setMode: mode => usePlayerViewModeStore.getState().setMode(mode),
    state: () => {
        const store = usePlayerViewModeStore.getState();
        const shell = document.querySelector<HTMLElement>('.min');
        const track = document.querySelector<HTMLElement>('.min-track');
        const match = /matrix\(([^)]+)\)/.exec(getComputedStyle(shell ?? document.body).transform)
            ?? /matrix\(([^)]+)\)/.exec(getComputedStyle(shell ?? document.body).transform);
        return {
            mode: store.mode,
            detour: store.detour,
            stageTransition: store.stageTransition,
            page: store.page,
            pos: Number(/translate3d\((-?[\d.]+)%/.exec(track?.style.transform ?? '')?.[1] ?? 0) / -50,
            phase: shell?.dataset.phase ?? 'idle',
            backs: [...backLog],
            panel: {
                open: useAppViewStore.getState().isPanelOpen,
                tab: useAppViewStore.getState().panelTab,
            },
            counts: {
                minimal: document.querySelectorAll('.min').length,
                stage: document.querySelectorAll('[data-testid="mobile-stage-chrome"]').length,
            },
            transform: match ? match[1] : '',
            viewport: { w: window.innerWidth, h: window.innerHeight },
        };
    },
};
