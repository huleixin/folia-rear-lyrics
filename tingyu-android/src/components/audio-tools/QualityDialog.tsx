import React, { useEffect, useState } from 'react';
import ThemedDialog from '../shared/ThemedDialog';
import { useAudioToolsStore, QUALITY_LABELS } from '../../stores/useAudioToolsStore';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { getPlaybackSourceRef, getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import type { AudioQualityPreference } from '../../types/onlineMusic';
import { getLocalSong } from '../../services/db';
import { useLxSourceStore } from '../../stores/useLxSourceStore';

// src/components/audio-tools/QualityDialog.tsx
export default function QualityDialog({ isDaylight }: { isDaylight: boolean }) {
    const state = useAudioToolsStore();
    const quality = useAudioSettingsStore(s => s.audioQuality);
    const song = usePlaybackStore(s => s.currentSong);
    const source = song ? getPlaybackSourceRef(song) : null;
    const local = source?.kind === 'local' || source?.kind === 'navidrome' || source?.kind === 'stage';
    const localId = source?.kind === 'local' ? source.mediaId : undefined;
    const [fileInfo, setFileInfo] = useState('');
    useEffect(() => { let alive = true; setFileInfo(''); if (localId) void getLocalSong(localId).then(file => { if (alive && file) setFileInfo([file.fileName.split('.').at(-1)?.toUpperCase(), file.bitrate ? `${Math.round(file.bitrate / 1000)} kbps` : '', file.mimeType].filter(Boolean).join(' · ')); }); return () => { alive = false; }; }, [localId]);
    const actual = song && state.actual?.key === getPlaybackSongKey(song) ? state.actual.quality : null;
    useEffect(() => { const back = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); state.close(); } }; window.addEventListener('keydown', back); return () => window.removeEventListener('keydown', back); }, []);
    return <ThemedDialog isOpen onClose={state.close} isDaylight={isDaylight} title="音质" panelKind="audio-tools" description={local ? '本地或外部音频按原文件播放，不重新编码' : '切换后保留播放位置；可用音质由音源和账号决定'}>
        <div className="ty-quality-choices">{(Object.keys(QUALITY_LABELS) as AudioQualityPreference[]).map(value => <button key={value} disabled={local || state.switching} aria-pressed={value === quality} onClick={() => state.switchQuality(value)}>{QUALITY_LABELS[value]}{value === quality ? ' ✓' : ''}</button>)}</div>
        <p className="ty-audio-hint">{state.switching ? '正在准备新音质，原音频继续播放…' : `首选：${QUALITY_LABELS[quality]} · 当前：${actual ? QUALITY_LABELS[actual] : local ? '原文件' : '未确认（可能来自缓存）'}`}</p>
        {fileInfo && <p className="ty-audio-hint">{fileInfo}</p>}
        {state.error && <p role="alert">{state.error}</p>}
        <button className="ty-source-entry" onClick={() => { state.close(); useAudioSettingsStore.getState().openAudioEqualizer(); }}>音效调节器 ›</button>
        <button className="ty-source-entry" onClick={() => { state.close(); useLxSourceStore.getState().show(); }}>洛雪自定义音源 ›</button>
    </ThemedDialog>;
}
