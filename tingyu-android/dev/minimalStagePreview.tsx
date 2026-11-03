import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import './../src/index.css';
import './../src/i18n/config';
import MinimalStage from '../src/components/app/overlays/minimal-stage/MinimalStage';
import type { AppOverlaysModel } from '../src/components/app/overlays/buildAppOverlaysModel';
import { lyricCurrentTime, currentTime } from '../src/stores/motionSignals';
import { usePlaybackStore } from '../src/stores/usePlaybackStore';
import { usePlayerViewModeStore, type MinimalPlayerPage } from '../src/stores/usePlayerViewModeStore';
import { FALLBACK_AI_DUAL_THEME } from '../src/services/themeSanitizer';
import { PlayerState, type Line } from '../src/types';

// dev/minimalStagePreview.tsx
// Local harness for the minimal front stage: same component, same stores, mocked playback.
//
// It exists because the real page only appears after a song is playing on Android, and the visual
// questions here (cover scale, chip size, lyric pitch, highlight colour) have to be answered at a
// real phone viewport. Query flags drive the states that are hard to reach by hand:
//   ?page=cover|lyrics  ?theme=dark|light  ?song=normal|long|nolyrics|nocover  ?paused=1
//   ?stationary=1 (freeze the clock at the demo position instead of advancing it)

const params = new URLSearchParams(location.search);
const page = (params.get('page') === 'lyrics' ? 'lyrics' : 'cover') as MinimalPlayerPage;
const light = params.get('theme') === 'light';
const songCase = params.get('song') ?? 'normal';
const paused = params.get('paused') === '1';
const stationary = params.get('stationary') === '1';

const SONG_CASES: Record<string, { name: string; artist: string; cover: string | null }> = {
    normal: { name: '并肩前行', artist: '周杰伦', cover: '/dev/assets/minimal-preview-cover.jpg' },
    long: {
        name: '当风穿过城市的尽头我还在回忆那场邂逅而你笑着说未来并不遥远',
        artist: '群星 / 某某乐队 / 另一位合作歌手',
        cover: '/dev/assets/minimal-preview-cover.jpg',
    },
    nolyrics: { name: '无声的长夜', artist: '佚名', cover: '/dev/assets/minimal-preview-cover.jpg' },
    nocover: { name: '封面缺失的样本', artist: '本地文件', cover: null },
};

const song = SONG_CASES[songCase] ?? SONG_CASES.normal!;

const LINES = [
    '当风穿过城市的尽头',
    '我还在回忆那场邂逅',
    '你笑着说 未来不遥远',
    '我们会一直并肩前行',
    '就算有再多的风和雨',
    '也走不出我们的约定',
    '在繁星下许下的心愿',
    '偶尔会在时间里发光',
    '当风穿过城市的尽头',
    '我还在回忆那场邂逅',
];

const LINE_SECONDS = 9;

/** Even word timings per line — enough for the per-character highlight to advance naturally. */
const buildLines = (): Line[] => LINES.map((text, index) => {
    const start = index * LINE_SECONDS;
    const chars = Array.from(text);
    const step = (LINE_SECONDS - 1.2) / chars.length;
    return {
        fullText: text,
        startTime: start,
        endTime: start + LINE_SECONDS - 1,
        translation: index === 3 ? 'We will keep walking shoulder to shoulder' : undefined,
        words: chars.map((char, charIndex) => ({
            text: char,
            startTime: start + charIndex * step,
            endTime: start + (charIndex + 1) * step,
        })),
    } as Line;
});

const lyrics = { lines: buildLines(), isWordByWord: true };

// Mid-way through the fourth line, so a screenshot lands with part of it already sung — the state
// the reference image shows.
const DEMO_TIME = 3 * LINE_SECONDS + 2.1;
const startedAt = performance.now();

const theme = light ? FALLBACK_AI_DUAL_THEME.light : FALLBACK_AI_DUAL_THEME.dark;
const duration = 258;

usePlaybackStore.setState({
    currentSong: {
        id: 'preview',
        name: song.name,
        artists: [{ id: 'preview-artist', name: song.artist }],
        album: { id: 'preview-album', name: '示例专辑' },
        durationMs: duration * 1000,
        catalogAudioSpecs: ['hires', 'lossless'],
    } as never,
    audioSrc: '/dev/assets/preview.flac',
    duration,
    playerState: paused ? PlayerState.PAUSED : PlayerState.PLAYING,
    lyrics: songCase === 'nolyrics' ? { lines: [] } : lyrics,
});

usePlayerViewModeStore.setState({ page, detour: false, mode: 'minimal' });

const chrome: NonNullable<AppOverlaysModel['mobileStage']> = {
    song: { title: song.name, artist: song.artist, coverUrl: song.cover },
    onBack: () => { },
    hidden: false,
};

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
const seekLog: number[] = [];

const controls = {
    controlsDisabled: false,
    canTogglePlay: true,
    currentTime,
    lyricCurrentTime,
    duration,
    playerState: paused ? PlayerState.PAUSED : PlayerState.PLAYING,
    loopMode: 'all',
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
    onTogglePlay: () => { },
    onToggleLoop: noop,
    onNavigateToPlayer: noop,
    onFocusLatticeCurrentSong: noop,
    onCommitBottomBarOffset: noop,
    slotContext: { isLiked: params.get('liked') === '1', likeDisabled: false, onLike: noop },
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

document.documentElement.dataset.foliaSurface = 'rear-lyrics';
document.documentElement.style.background = light ? '#eef3ef' : '#071312';

/**
 * The WebView is laid out inside the system bars, so the real page never starts at y=0. A browser
 * has no insets of its own, so the harness stands in for them with the same values a 393×852 phone
 * reports — otherwise every screenshot would misrepresent the top bar's distance from the edge.
 */
const SAFE_TOP = 50;
const SAFE_BOTTOM = 24;

function Preview() {
    useEffect(() => { tick(); }, []);
    return (
        <div style={{ position: 'fixed', inset: `${SAFE_TOP}px 0 ${SAFE_BOTTOM}px`, overflow: 'hidden' }}>
            <MinimalStage chrome={chrome} controls={controls} />
        </div>
    );
}

createRoot(document.getElementById('root')!).render(<Preview />);

// Test seams: drive the clock, and read back what the page actually did.
type PreviewState = {
    seek: (time: number) => void;
    closeStage: () => void;
    state: () => { page: string; detour: boolean; mode: string; seeks: number[]; scrollLeft: number; pageWidth: number };
};
(window as unknown as { __minimalPreview: PreviewState }).__minimalPreview = {
    seek: time => {
        currentTime.set(time);
        lyricCurrentTime.set(time);
    },
    closeStage: () => usePlayerViewModeStore.getState().closeStage(),
    state: () => {
        const pager = document.querySelector<HTMLElement>('.min-pager');
        const store = usePlayerViewModeStore.getState();
        return {
            page: store.page,
            detour: store.detour,
            mode: store.mode,
            seeks: [...seekLog],
            scrollLeft: pager?.scrollLeft ?? 0,
            pageWidth: pager?.clientWidth ?? 0,
        };
    },
};
