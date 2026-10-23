import { useEffect, useRef, useState } from 'react';
import type { UnifiedPanelProps } from '../UnifiedPanel';
import type { LocalSong, UnifiedSong } from '../../types';
import { getLocalSong } from '../../services/db';
import { isLocalPlaybackSong, resolveNavidromePlaybackCarrier } from '../../utils/appPlaybackGuards';
import { readLyricFile } from '../../utils/lyrics/lyricFileDecoding';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { useMobileToolsText } from './useMobileToolsText';

// src/components/mobile-player/useMobileLyrics.ts
export function useMobileLyrics(p: UnifiedPanelProps['playback']) {
    const text = useMobileToolsText();
    const local = isLocalPlaybackSong(p.currentSong);
    const navi = p.currentSong ? resolveNavidromePlaybackCarrier(p.currentSong) : null;
    const id = (p.currentSong as UnifiedSong | null)?.localRef?.songId;
    const activeLocal = usePlaybackStore(s => s.activeLocalLyricsSource);
    const [data, setData] = useState<LocalSong | null>(null);
    const [revision, setRevision] = useState(0);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => {
        let cancelled = false;
        if (local && id) void getLocalSong(id).then(song => { if (!cancelled) setData(song || null); }).catch(() => { if (!cancelled) setData(null); });
        return () => { cancelled = true; };
    }, [local, id, revision, activeLocal]);
    const options: {id:string; label:string}[] = local ? [
        ...(data?.hasLocalLyrics ? [{id:'local',label:text.local}] : []),
        ...(data?.hasEmbeddedLyrics ? [{id:'embedded',label:text.embedded}] : []),
        ...(data?.matchedLyrics?.lines?.length || data?.markedPureMusic ? [{id:'online',label:text.platform}] : []),
    ] : navi ? [{id:navi.lyricsSource==='online'?'online':'embedded',label:navi.lyricsSource==='online'?text.platform:text.server}] : [
        {id:'online',label:text.platform}, ...(p.onlineLyricsState?.importedLyrics ? [{id:'imported',label:text.imported}] : []),
    ];
    const selected = local ? activeLocal || data?.lyricsSource : navi ? navi.lyricsSource === 'online' ? 'online' : 'embedded' : p.onlineLyricsState?.lyricsSource || 'online';
    const select = (source:string) => {
        if (navi) return;
        if (local) p.onChangeLyricsSource(source as 'local'|'embedded'|'online');
        else p.onChangeOnlineLyricsSource(source as 'online'|'imported');
    };
    const upload = async (file: File, translation = false) => {
        setBusy(true); setMessage('');
        try {
            const content = await readLyricFile(file);
            if (!alive.current) return;
            if (!content.trim()) throw Error('empty');
            if (local) await p.onUpdateLocalLyrics(content,translation,file.name);
            else await p.onImportOnlineLyrics(content,file.name);
            if (!alive.current) return;
            setMessage(text.importedOk); setRevision(x => x + 1);
        } catch { if (alive.current) setMessage(text.importFailed); }
        finally { if (alive.current) setBusy(false); }
    };
    const match = () => { p.onToggle(); (local || navi ? p.onMatchOnline : p.onMatchOnlineLyrics)(); };
    return { local, navi, options, selected, select, upload, match, message, busy, data };
}
