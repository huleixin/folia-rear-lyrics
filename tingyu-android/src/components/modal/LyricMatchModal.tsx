import MobileLyricMatcher from '../mobile-player/MobileLyricMatcher';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, X, Music, Check, FileAudio, Piano } from 'lucide-react';
import { LocalSong, SongResult } from '../../types';
import { applyLocalSongMatchSelection, resolveLyricMatchMetadataSelection, setLocalSongPureMusicMark } from '../../services/localSongMatchSelectionService';
import { buildLocalSongMetadataSearchTarget, normalizeLyricMatchMetadataCandidate } from '../../services/onlineMetadataSearchService';
import { formatSongName } from '../../utils/songNameFormatter';
import { calculateMatchScoreDetails } from '../../utils/lyrics/matchScore';
import { buildLyricSearchQuery } from '../../utils/lyrics/searchQuery';
import { fetchLyricsForMatchSource, LYRIC_MATCH_SOURCES, searchLyricsByMatchSource } from '../../utils/lyrics/lyricMatchSources';
import { getLocalCoverAssetUrl } from '../../services/localCoverAssetUrl';
import { getLocalLibraryAssignment } from '../../services/localLibraryEntityRepository';
import { getSizedCoverUrl } from '../../utils/coverUrl';
import {
    getLyricMatchSourceLabel,
    getMatchResultAlbumName,
    getMatchResultArtists,
    getMatchResultCoverUrl,
    sourceProvidesSongMetadata,
    sourceSupportsCover,
    type LyricMatchSource,
} from './lyricMatchResultHelpers';
import { LyricPreviewPanel } from './LyricPreviewPanel';
import { DurationMatchBadge } from './DurationMatchBadge';
import { hasRenderableLyrics } from '../../utils/lyrics/validity';

interface LyricMatchModalProps {
    song: LocalSong;
    onClose: () => void;
    onMatch: () => void;
    /** 纯音乐标记切换后调用（不走 onMatch：标记只换歌词，不必重新播放）。 */
    onPureMusicMarkChanged: (marked: boolean) => void | Promise<void>;
    isDaylight: boolean;
}

const LyricMatchModal: React.FC<LyricMatchModalProps> = ({ song, onClose, onMatch, onPureMusicMarkChanged, isDaylight }) => {
    const { t } = useTranslation();

    // Dynamic theme classes
    const bgClass = isDaylight ? 'bg-white/90 border-white/20' : 'bg-zinc-900/95 border-white/10';
    const textPrimary = isDaylight ? 'text-zinc-900' : 'text-white';
    const textSecondary = isDaylight ? 'text-zinc-500' : 'text-zinc-400';
    const borderColor = isDaylight ? 'border-black/5' : 'border-white/10';
    const inputBg = isDaylight ? 'bg-black/5 focus:bg-black/10 border-black/10 focus:border-black/20' : 'bg-white/5 focus:bg-white/10 border-white/10 focus:border-white/20';
    const searchBtnBg = isDaylight ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-600' : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300';
    const resultItemBg = isDaylight ? 'bg-black/5 hover:bg-black/10 border-black/5' : 'bg-white/5 hover:bg-white/10 border-white/5';
    const resultItemSelected = isDaylight ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-500/20 border-blue-500/50';
    const closeBtnHover = isDaylight ? 'hover:bg-zinc-200/50' : 'hover:bg-white/10';
    const cancelBtnBg = isDaylight ? 'bg-zinc-100/80 hover:bg-zinc-200' : 'bg-white/5 hover:bg-white/10';
    const noMatchBtnBg = isDaylight ? 'bg-red-500/5 hover:bg-red-500/10 border-red-500/10' : 'bg-red-500/10 hover:bg-red-500/20 border-red-500/20';
    const pureMusicBtn = song.markedPureMusic
        ? (isDaylight ? 'bg-violet-500/15 hover:bg-violet-500/20 border-violet-500/30 text-violet-700' : 'bg-violet-500/25 hover:bg-violet-500/30 border-violet-400/40 text-violet-200')
        : (isDaylight ? 'bg-violet-500/5 hover:bg-violet-500/10 border-violet-500/15 text-violet-600' : 'bg-violet-500/10 hover:bg-violet-500/20 border-violet-400/25 text-violet-300');
    const dotBase = isDaylight ? 'bg-zinc-300' : 'bg-zinc-600';
    const dotActive = isDaylight ? 'bg-blue-500' : 'bg-blue-400';

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SongResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedResult, setSelectedResult] = useState<SongResult | null>(null);
    const [isMatching, setIsMatching] = useState(false);
    const [isMarkingPureMusic, setIsMarkingPureMusic] = useState(false);
    const searchRequestIdRef = useRef(0);

    const [source, setSource] = useState<LyricMatchSource>('netease');

    // Online data toggle state (dots)
    const [lyricsSource, setLyricsSource] = useState<'local' | 'embedded' | 'online' | undefined>(song.lyricsSource || 'online');
    const [useOnlineCover, setUseOnlineCover] = useState(song.useOnlineCover ?? !song.localCoverAssetId);
    const [useOnlineMetadata, setUseOnlineMetadata] = useState(song.titleOrigin !== 'import');

    // Derive song information for matching
    const songInfo = useMemo(() => {
        const title = song.title || song.fileName.replace(/\.(mp3|flac|m4a|wav|ogg|opus|aac)$/i, '');
        const artist = song.onlineMetadata?.artists.map(item => item.name).join(', ')
            || song.importedMetadata.artistNames.join(', ');
        const durationMs = song.duration || 0;
        const album = song.onlineMetadata?.album?.name || song.importedMetadata.albumName || '';
        return { title, artist, album, durationMs };
    }, [song]);

    // Selecting a result defaults lyrics to online while metadata remains an all-or-nothing bundle.
    useEffect(() => {
        if (selectedResult) {
            setLyricsSource('online');
        }
    }, [selectedResult]);

    const previewCoverUrl = useMemo(() => {
        const localCoverUrl = getLocalCoverAssetUrl(song.localCoverAssetId, 512);
        if (!selectedResult) {
            return song.useOnlineCover ? song.onlineMetadata?.coverUrl || localCoverUrl : localCoverUrl;
        } else if (useOnlineCover) {
            const selectedCoverUrl = getMatchResultCoverUrl(selectedResult, source);
            return selectedCoverUrl || song.onlineMetadata?.coverUrl || localCoverUrl;
        }
        return localCoverUrl;
    }, [selectedResult, useOnlineCover, song, source]);

    // Derive lyrics source label
    const lyricsSourceLabel = useMemo(() => {
        if (lyricsSource === 'online') {
            if (!selectedResult && song.markedPureMusic) return t('localMusic.statusPureMusic');
            const src = selectedResult ? source : (song.matchedLyricsSource || 'netease');
            const platform = selectedResult?.amllDbPlatform ?? song.matchedLyricsProviderPlatform;
            return getLyricMatchSourceLabel(src, platform);
        }
        if (lyricsSource === 'embedded') return t('localMusic.statusEmbedded');
        if (lyricsSource === 'local') return t('localMusic.statusLocal');
        // Default: show what would be selected by priority
        if (song.hasLocalLyrics) return t('localMusic.statusLocal');
        if (song.hasEmbeddedLyrics) return t('localMusic.statusEmbedded');
        return t('localMusic.statusNone');
    }, [lyricsSource, song, t, source, selectedResult]);

    const runSearch = async (query: string, activeSource: LyricMatchSource) => {
        const q = query.trim();
        if (!q) return;

        const requestId = ++searchRequestIdRef.current;
        setIsSearching(true);
        setSearchResults([]);
        setSelectedResult(null);

        try {
            const results = await searchLyricsByMatchSource(activeSource, q, songInfo);
            if (requestId !== searchRequestIdRef.current) return;

            setSearchResults(results);
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            if (requestId === searchRequestIdRef.current) {
                setIsSearching(false);
            }
        }
    };

    // Initialize the query only when the target song changes.
    useEffect(() => {
        const title = song.title || song.fileName.replace(/\.(mp3|flac|m4a|wav|ogg|opus|aac)$/i, '');
        const initialQuery = buildLyricSearchQuery(
            title,
            song.onlineMetadata?.artists.map(item => item.name).join(', ') || song.importedMetadata.artistNames.join(', '),
            song.onlineMetadata?.album?.name || song.importedMetadata.albumName || '',
        );
        setSearchQuery(initialQuery);
        void runSearch(initialQuery, source);
    }, [song]);

    // Source changes should reuse the user's current query instead of resetting it.
    useEffect(() => {
        void runSearch(searchQuery, source);
    }, [source]);

    const handleSearch = async (query?: string) => {
        await runSearch(query || searchQuery, source);
    };

    const handleConfirm = async () => {
        if (!selectedResult) return;

        setIsMatching(true);
        try {
            const candidate = normalizeLyricMatchMetadataCandidate(
                source,
                selectedResult,
                buildLocalSongMetadataSearchTarget(song),
            );
            const selection = resolveLyricMatchMetadataSelection(source, candidate, { useOnlineMetadata, useOnlineCover });
            if (selection.metadata === 'online') {
                const assignment = await getLocalLibraryAssignment(song.id);
                const protectedOrigins = new Set(['manual', 'split']);
                const replacesProtectedArtist = Boolean(
                    candidate.artists.length
                    && assignment
                    && protectedOrigins.has(assignment.artistOrigin),
                );
                const replacesProtectedAlbum = Boolean(
                    candidate.album?.name
                    && assignment
                    && protectedOrigins.has(assignment.albumOrigin),
                );
                if ((replacesProtectedArtist || replacesProtectedAlbum)
                    && !window.confirm(t('localMusic.replaceProtectedEntityConfirm'))) return;
            }
            let processed = null;
            let lyricsFailed = false;
            if (lyricsSource === 'online') {
                try {
                    processed = await fetchLyricsForMatchSource(source, selectedResult);
                    lyricsFailed = !processed?.isPureMusic && !hasRenderableLyrics(processed?.lyrics);
                } catch (error) {
                    console.warn('[LocalMusic] Lyrics failed while applying metadata selection:', error);
                    lyricsFailed = true;
                }
            }
            // 选中的结果本身是纯音乐（没有歌词行）时按纯音乐标记保存；以前这种结果在歌词上什么都不存。
            const pickedPureMusic = lyricsSource === 'online' && Boolean(processed?.isPureMusic) && !processed?.lyrics;
            const applied = await applyLocalSongMatchSelection({
                songId: song.id,
                ...selection,
                setPureMusicMark: pickedPureMusic ? true : undefined,
                lyrics: lyricsSource || 'automatic',
                onlineLyrics: processed?.lyrics ? {
                    lyrics: processed.lyrics,
                    songId: selectedResult.id,
                    source,
                    providerPlatform: processed.matchedLyricsProviderPlatform,
                    isPureMusic: processed.isPureMusic,
                } : undefined,
                lyricsFailed,
            });
            onMatch();
            if (applied.partialLyricsFailure) alert(t('localMusic.lyricsNotAppliedOtherSaved'));
            else if (applied.coverAttempted && !applied.coverCached) alert(t('localMusic.coverCacheFailed'));
        } catch (error) {
            console.error('Failed to match or save song:', error);
            alert(t('localMusic.matchFailed'));
        } finally {
            setIsMatching(false);
        }
    };

    const handleNoMatch = async () => {
        try {
            await applyLocalSongMatchSelection({
                songId: song.id,
                metadata: 'imported',
                cover: 'embedded',
                lyrics: 'automatic',
                setNoAutoMatch: true,
            });
            onMatch(); // Trigger refresh so the change applies
        } catch (error) {
            console.error('Failed to save song:', error);
            alert(t('localMusic.matchFailed'));
        }
    };

    // 标记 / 取消纯音乐：只改歌词的自动匹配，元数据与封面不动。
    const handleTogglePureMusicMark = async () => {
        const marked = !song.markedPureMusic;
        setIsMarkingPureMusic(true);
        try {
            await setLocalSongPureMusicMark(song.id, marked);
            await onPureMusicMarkChanged(marked);
        } catch (error) {
            console.error('Failed to toggle the instrumental mark:', error);
            alert(t('localMusic.pureMusicMarkFailed'));
        } finally {
            setIsMarkingPureMusic(false);
        }
    };

    const canUseOnlineMetadata = sourceProvidesSongMetadata(source);
    const previewsOnlineMetadata = useOnlineMetadata && canUseOnlineMetadata && selectedResult;
    const previewTitle = previewsOnlineMetadata
        ? formatSongName(selectedResult)
        : song.importedMetadata.title;
    const previewArtist = previewsOnlineMetadata
        ? getMatchResultArtists(selectedResult)
        : song.importedMetadata.artistNames.join(', ');
    const previewAlbum = previewsOnlineMetadata
        ? getMatchResultAlbumName(selectedResult)
        : song.importedMetadata.albumName || '';


    return <MobileLyricMatcher title={songInfo.title} query={searchQuery} onQuery={setSearchQuery} source={source} onSource={value=>{setSelectedResult(null);setSearchResults([]);setSource(value);}} results={searchResults} selected={selectedResult} onSelect={setSelectedResult} searching={isSearching} matching={isMatching} onSearch={()=>void handleSearch()} onConfirm={()=>void handleConfirm()} onClose={onClose} isDaylight={isDaylight} options={<details className="ty-card"><summary>{t('localMusic.matchOptions')}</summary>
            <label className="ty-check"><input type="checkbox" checked={useOnlineCover&&sourceSupportsCover(source,selectedResult)} disabled={!sourceSupportsCover(source,selectedResult)||isMatching} onChange={e=>setUseOnlineCover(e.target.checked)}/>{t('localMusic.coverSource')}</label>
            <label className="ty-check"><input type="checkbox" checked={useOnlineMetadata&&canUseOnlineMetadata} disabled={!canUseOnlineMetadata||isMatching} onChange={e=>setUseOnlineMetadata(e.target.checked)}/>{t('localMusic.metadataSource')}</label>
            <label className="ty-check"><input type="checkbox" checked={lyricsSource==='online'} disabled={isMatching} onChange={e=>setLyricsSource(e.target.checked?'online':undefined)}/>{t('localMusic.preferOnline')}</label>
            <button className="ty-action" disabled={isMatching} onClick={()=>void handleNoMatch()}>{t('localMusic.skipOnlineMatch')}</button>
            <button className="ty-action" disabled={isMarkingPureMusic||isMatching} onClick={()=>void handleTogglePureMusicMark()}>{t(song.markedPureMusic?'localMusic.unmarkPureMusic':'localMusic.markPureMusic')}</button>
        </details>} />;
};
export default LyricMatchModal;
