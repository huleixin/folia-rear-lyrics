import MobileLyricMatcher from '../mobile-player/MobileLyricMatcher';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, X, Music, Check } from 'lucide-react';
import { AmllDbPlatform, LyricProviderSource, SongResult, LyricData } from '../../types';
import { NavidromeSong } from '../../types/navidrome';
import type { MediaId } from '../../types/onlineMusic';
import { saveToCache, getFromCacheWithMigration } from '../../services/db';
import { formatSongName } from '../../utils/songNameFormatter';
import { migrateMatchedLyricsCarrierRenderHints } from '../../utils/lyrics/storageMigration';
import { calculateMatchScore } from '../../utils/lyrics/matchScore';
import { buildLyricSearchQuery } from '../../utils/lyrics/searchQuery';
import { fetchLyricsForMatchSource, LYRIC_MATCH_SOURCES, searchLyricsByMatchSource } from '../../utils/lyrics/lyricMatchSources';
import {
    getLyricMatchSourceLabel,
    getMatchResultAlbumName,
    getMatchResultArtists,
    getMatchResultCoverUrl,
    type LyricMatchSource,
} from './lyricMatchResultHelpers';
import { LyricPreviewPanel } from './LyricPreviewPanel';
import { getSizedCoverUrl } from '../../utils/coverUrl';
import { getProviderSongMetadata } from '../../services/onlineMusic/songMetadata';
import { hasRenderableLyrics } from '../../utils/lyrics/validity';

export interface NavidromeMatchData {
    matchedSongId?: MediaId;
    matchedLyrics?: LyricData;
    matchedIsPureMusic?: boolean;
    matchedCoverUrl?: string;
    matchedArtists?: string;
    matchedAlbumId?: MediaId;
    matchedAlbumName?: string;
    useOnlineLyrics?: boolean; // Legacy, kept for backward compatibility
    lyricsSource?: 'navi' | 'online';
    useOnlineCover?: boolean;
    useOnlineMetadata?: boolean;
    noAutoMatch?: boolean;
    hasManualLyricSelection?: boolean;
    matchedLyricsSource?: LyricProviderSource;
    matchedLyricsProviderPlatform?: AmllDbPlatform;
}

interface NaviLyricMatchModalProps {
    song: NavidromeSong;
    onClose: () => void;
    onMatch: () => void;
    isDaylight: boolean;
}

const NaviLyricMatchModal: React.FC<NaviLyricMatchModalProps> = ({ song, onClose, onMatch, isDaylight }) => {
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
    const dotBase = isDaylight ? 'bg-zinc-300' : 'bg-zinc-600';
    const dotActive = isDaylight ? 'bg-blue-500' : 'bg-blue-400';
    const editInputBg = isDaylight ? 'bg-black/5 border-black/10 focus:border-black/20' : 'bg-white/5 border-white/10 focus:border-white/20';

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SongResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedResult, setSelectedResult] = useState<SongResult | null>(null);
    const [isMatching, setIsMatching] = useState(false);

    // Initial config from cache
    const [initialMatchData, setInitialMatchData] = useState<NavidromeMatchData | null>(null);

    // Online data toggle state
    const [lyricsSource, setLyricsSource] = useState<'navi' | 'online'>('online');
    const [source, setSource] = useState<LyricMatchSource>('netease');
    const searchGeneration = useRef(0);

    const navidromeMetadata = getProviderSongMetadata(song);
    const navidromeArtist = navidromeMetadata.artists.map(a => a.name).join(', ');
    const navidromeAlbum = navidromeMetadata.album?.name || '';

    const songInfo = useMemo(() => {
        return {
            title: song.name || '',
            artist: navidromeArtist || '',
            album: navidromeAlbum || '',
            durationMs: navidromeMetadata.durationMs,
        };
    }, [song, navidromeArtist, navidromeAlbum]);

    // Prepare component data
    useEffect(() => {
        const loadExistingMatch = async () => {
            const data = await getFromCacheWithMigration<NavidromeMatchData>(
                `navidrome_match_${song.navidromeData.id}`,
                migrateMatchedLyricsCarrierRenderHints
            );
            if (data) {
                setInitialMatchData(data);
                setLyricsSource(data.lyricsSource ?? 'online');
            } else {
                setLyricsSource('online');
            }
        };
        loadExistingMatch();
    }, [song]);

    const handleSearch = async (query?: string) => {
        const q = query || searchQuery;
        if (!q.trim()) return;

        const generation = ++searchGeneration.current;
        setIsSearching(true);
        setSearchResults([]);
        setSelectedResult(null);

        try {
            const results = await searchLyricsByMatchSource(source, q, songInfo);
            if (generation !== searchGeneration.current) return;
            setSearchResults(results);

            // Preselect exact match roughly
            const exactMatch = results.find(s => s.name.toLowerCase() === song.name.toLowerCase());
            if (exactMatch) {
                setSelectedResult(exactMatch);
            } else if (results.length > 0) {
                setSelectedResult(results[0]);
            }
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            if (generation === searchGeneration.current) setIsSearching(false);
        }
    };

    // Auto search on mount
    useEffect(() => {
        let isCurrent = true;
        const generation = ++searchGeneration.current;
        const query = buildLyricSearchQuery(song.name, navidromeArtist, navidromeAlbum);
        setSearchQuery(query);
        setIsSearching(true);
        setSearchResults([]);
        setSelectedResult(null);

        void (async () => {
            try {
                const results = await searchLyricsByMatchSource(source, query, songInfo);

                if (!isCurrent || generation !== searchGeneration.current) return;

                setSearchResults(results);
                const exactMatch = results.find(s => s.name.toLowerCase() === song.name.toLowerCase());
                if (exactMatch) {
                    setSelectedResult(exactMatch);
                } else if (results.length > 0) {
                    setSelectedResult(results[0]);
                }
            } catch (error) {
                console.error('Search failed:', error);
            } finally {
                if (isCurrent && generation === searchGeneration.current) {
                    setIsSearching(false);
                }
            }
        })();

        return () => {
            isCurrent = false;
        };
    }, [song, source, navidromeArtist, navidromeAlbum]);

    // When a search result is selected, update lyricsSource to 'online'
    useEffect(() => {
        if (selectedResult) {
            setLyricsSource('online');
        }
    }, [selectedResult]);



    const handleConfirm = async () => {
        if (!selectedResult) return;

        setIsMatching(true);
        try {
            // Always fetch lyrics
            const processed = await fetchLyricsForMatchSource(source, selectedResult);
            if (!processed || (!hasRenderableLyrics(processed.lyrics) && !processed.isPureMusic)) {
                alert(t('localMusic.noLyricsAvailable'));
                return;
            }
            const parsedLyrics: LyricData | null = processed ? processed.lyrics : null;

            const matchData: NavidromeMatchData = {
                matchedSongId: selectedResult.id,
                matchedLyrics: parsedLyrics || undefined,
                matchedIsPureMusic: processed.isPureMusic,
                useOnlineLyrics: lyricsSource === 'online',
                lyricsSource,
                hasManualLyricSelection: true,
                matchedLyricsSource: source,
                matchedLyricsProviderPlatform: processed.matchedLyricsProviderPlatform,
            };

            if (source !== 'netease') {
                matchData.useOnlineCover = false;
                matchData.useOnlineMetadata = false;
            }

            await saveToCache(`navidrome_match_${song.navidromeData.id}`, matchData);

            onMatch();
        } catch (error) {
            console.error('Failed to save Navidrome match:', error);
            alert(t('localMusic.matchFailed'));
        } finally {
            setIsMatching(false);
        }
    };

    const handleNoMatch = async () => {
        setIsMatching(true);
        try {
            const matchData: NavidromeMatchData = {
                noAutoMatch: true,
                useOnlineLyrics: false,
                lyricsSource: 'navi' as const,
                hasManualLyricSelection: true
            };
            await saveToCache(`navidrome_match_${song.navidromeData.id}`, matchData);
            onMatch();
        } catch (error) {
            console.error('Failed to save no match preference:', error);
        } finally {
            setIsMatching(false);
        }
    };

    const coverUrl = navidromeMetadata.coverUrl || song.navidromeData?.coverArtUrl || null;
    const selectedCoverUrl = getMatchResultCoverUrl(selectedResult, source);
    const selectedArtists = getMatchResultArtists(selectedResult);
    const selectedAlbum = getMatchResultAlbumName(selectedResult);

    return <MobileLyricMatcher title={songInfo.title} query={searchQuery} onQuery={setSearchQuery} source={source} onSource={value=>{setSelectedResult(null);setSearchResults([]);setSource(value);}} results={searchResults} selected={selectedResult} onSelect={setSelectedResult} searching={isSearching} matching={isMatching} onSearch={()=>void handleSearch()} onConfirm={()=>void handleConfirm()} onClose={onClose} isDaylight={isDaylight} options={<details className="ty-card"><summary>{t('navidrome.server')}</summary><label className="ty-check"><input type="checkbox" checked={lyricsSource==='online'} disabled={isMatching} onChange={e=>setLyricsSource(e.target.checked?'online':'navi')}/>{t('localMusic.preferOnline')}</label><button className="ty-action" disabled={isMatching} onClick={()=>void handleNoMatch()}>{t('localMusic.skipOnlineMatch')}</button></details>} />;
};
export default NaviLyricMatchModal;
