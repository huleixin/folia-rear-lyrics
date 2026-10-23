import MobileLyricMatcher from '../mobile-player/MobileLyricMatcher';
import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Music, Search, X } from 'lucide-react';
import type { OnlineLyricsState, SongResult } from '../../types';
import { formatSongName } from '../../utils/songNameFormatter';
import { loadOnlineLyricsState, saveOnlineLyricsState } from '../../utils/onlineLyricsState';
import { calculateMatchScore } from '../../utils/lyrics/matchScore';
import { buildLyricSearchQuery } from '../../utils/lyrics/searchQuery';
import { fetchLyricsForMatchSource, LYRIC_MATCH_SOURCES, searchLyricsByMatchSource } from '../../utils/lyrics/lyricMatchSources';
import { getLyricMatchSourceLabel, type LyricMatchSource } from './lyricMatchResultHelpers';
import {
    getMatchResultCoverUrl,
    getMatchResultArtists,
    getMatchResultAlbumName,
} from './lyricMatchResultHelpers';
import { LyricPreviewPanel } from './LyricPreviewPanel';
import { getProviderSongMetadata } from '../../services/onlineMusic/songMetadata';
import { getSizedCoverUrl } from '../../utils/coverUrl';
import { hasRenderableLyrics } from '../../utils/lyrics/validity';

// src/components/modal/OnlineLyricMatchModal.tsx

interface OnlineLyricMatchModalProps {
    song: SongResult;
    onClose: () => void;
    onMatch: () => void;
    isDaylight: boolean;
}

const OnlineLyricMatchModal: React.FC<OnlineLyricMatchModalProps> = ({ song, onClose, onMatch, isDaylight }) => {
    const { t } = useTranslation();
    const isMouseDownOnOverlayRef = useRef(false);
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

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SongResult[]>([]);
    const [selectedResult, setSelectedResult] = useState<SongResult | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isMatching, setIsMatching] = useState(false);
    const [source, setSource] = useState<LyricMatchSource>('netease');
    const searchGeneration = useRef(0);

    const songInfo = React.useMemo(() => {
        const metadata = getProviderSongMetadata(song);
        return {
            title: song.name || '',
            artist: metadata.artists.map(item => item.name).join(', '),
            album: metadata.album?.name || '',
            durationMs: metadata.durationMs,
        };
    }, [song]);

    const handleSearch = async (query = searchQuery) => {
        const q = query.trim();
        if (!q) {
            return;
        }

        const generation = ++searchGeneration.current;
        setIsSearching(true);
        setSearchResults([]);
        setSelectedResult(null);
        try {
            const results = await searchLyricsByMatchSource(source, q, songInfo);
            if (generation !== searchGeneration.current) return;
            setSearchResults(results);
            if (results.length > 0) {
                setSelectedResult(results[0]);
            }
        } catch (error) {
            console.error('Online lyric search failed', error);
        } finally {
            if (generation === searchGeneration.current) setIsSearching(false);
        }
    };

    useEffect(() => {
        let isCurrent = true;
        const generation = ++searchGeneration.current;

        const metadata = getProviderSongMetadata(song);
        const artist = metadata.artists.map(item => item.name).join(', ');
        const album = metadata.album?.name || '';
        const initialQuery = buildLyricSearchQuery(song.name, artist, album);
        setSearchQuery(initialQuery);
        setIsSearching(true);
        setSearchResults([]);
        setSelectedResult(null);

        void (async () => {
            try {
                const results = await searchLyricsByMatchSource(source, initialQuery, songInfo);

                if (!isCurrent || generation !== searchGeneration.current) {
                    return;
                }

                setSearchResults(results);
                if (results.length > 0) {
                    setSelectedResult(results[0]);
                }
            } catch (error) {
                if (isCurrent && generation === searchGeneration.current) {
                    console.error('Online lyric search failed', error);
                }
            } finally {
                if (isCurrent && generation === searchGeneration.current) {
                    setIsSearching(false);
                }
            }
        })();

        return () => {
            isCurrent = false;
        };
    }, [song, source]);

    const handleConfirm = async () => {
        if (!selectedResult) {
            return;
        }

        setIsMatching(true);
        try {
            const processed = await fetchLyricsForMatchSource(source, selectedResult);

            if (!processed || (!hasRenderableLyrics(processed.lyrics) && !processed.isPureMusic)) {
                alert(t('localMusic.noLyricsAvailable'));
                return;
            }

            if (processed) {
                const previousState = await loadOnlineLyricsState(song);
                const nextState: OnlineLyricsState = {
                    lyricsSource: 'online',
                    importedLyrics: previousState?.importedLyrics ?? null,
                    importedLyricsName: previousState?.importedLyricsName ?? null,
                    hasOnlineOverride: true,
                    onlineOverrideLyrics: processed.lyrics,
                    matchedSongId: selectedResult.id,
                    matchedIsPureMusic: processed.isPureMusic,
                    matchedLyricsSource: source,
                    matchedLyricsProviderPlatform: processed.matchedLyricsProviderPlatform,
                };
                await saveOnlineLyricsState(song, nextState);
                onMatch();
            }
        } catch (error) {
            console.error('Online lyric match failed', error);
        } finally {
            setIsMatching(false);
        }
    };

    const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        isMouseDownOnOverlayRef.current = event.target === event.currentTarget;
    };

    const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget && isMouseDownOnOverlayRef.current) {
            onClose();
        }
    };

    return <MobileLyricMatcher title={songInfo.title} query={searchQuery} onQuery={setSearchQuery} source={source} onSource={value=>{setSelectedResult(null);setSearchResults([]);setSource(value);}} results={searchResults} selected={selectedResult} onSelect={setSelectedResult} searching={isSearching} matching={isMatching} onSearch={()=>void handleSearch()} onConfirm={()=>void handleConfirm()} onClose={onClose} isDaylight={isDaylight} />;
};
export default OnlineLyricMatchModal;
