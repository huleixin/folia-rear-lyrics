import React from 'react';
import { ChevronRight, Disc3, Loader2, Music2, Search, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SearchSuggestion } from '../../../types/search';
import { getSizedCoverUrl } from '../../../utils/coverUrl';
import { HighlightedText } from './searchHighlight';

// src/components/app/search/SearchSuggestions.tsx
// 输入联想：上游给了真实条目就按类型列出；没有可用联想接口时不显示错误卡片，
// 只保留「搜索当前关键词」和命中的历史词，输入框照常可用。

type Props = {
    items: SearchSuggestion[];
    query: string;
    status: 'idle' | 'loading' | 'ready' | 'unavailable';
    /** 历史词里包含当前输入的项；没有联想接口时的真实降级。 */
    historyMatches: string[];
    onKeyword: (text: string) => void;
    onArtist: (item: Extract<SearchSuggestion, { kind: 'artist' }>) => void;
    onAlbum: (item: Extract<SearchSuggestion, { kind: 'album' }>) => void;
    onSong: (item: Extract<SearchSuggestion, { kind: 'song' }>) => void;
};

const SuggestionRow: React.FC<{
    suggestion: SearchSuggestion;
    query: string;
    onKeyword: Props['onKeyword'];
    onArtist: Props['onArtist'];
    onAlbum: Props['onAlbum'];
    onSong: Props['onSong'];
    kindSong: string;
    kindArtist: string;
    kindAlbum: string;
}> = ({ suggestion, query, onKeyword, onArtist, onAlbum, onSong, kindSong, kindArtist, kindAlbum }) => {
    if (suggestion.kind === 'keyword') {
        return <button type="button" className="ty-suggest-row" onClick={() => onKeyword(suggestion.text)}>
            <span className="ty-suggest-icon"><Search size={17} /></span>
            <span className="ty-suggest-copy"><span className="ty-suggest-title"><HighlightedText text={suggestion.text} query={query} /></span></span>
        </button>;
    }
    if (suggestion.kind === 'artist') {
        const cover = getSizedCoverUrl(suggestion.hit.coverUrl, 120);
        return <button type="button" className="ty-suggest-row" onClick={() => onArtist(suggestion)}>
            <span className="ty-suggest-icon" data-round="true">{cover ? <img src={cover} alt="" loading="lazy" /> : <UserRound size={18} />}</span>
            <span className="ty-suggest-copy">
                <span className="ty-suggest-title"><HighlightedText text={suggestion.hit.name} query={query} /></span>
                {suggestion.hit.description && <span className="ty-suggest-meta">{suggestion.hit.description}</span>}
            </span>
            <span className="ty-suggest-kind">{kindArtist}</span>
        </button>;
    }
    if (suggestion.kind === 'album') {
        const cover = getSizedCoverUrl(suggestion.hit.coverUrl, 120);
        return <button type="button" className="ty-suggest-row" onClick={() => onAlbum(suggestion)}>
            <span className="ty-suggest-icon">{cover ? <img src={cover} alt="" loading="lazy" /> : <Disc3 size={18} />}</span>
            <span className="ty-suggest-copy">
                <span className="ty-suggest-title"><HighlightedText text={suggestion.hit.name} query={query} /></span>
                {suggestion.hit.artistName && <span className="ty-suggest-meta">{suggestion.hit.artistName}</span>}
            </span>
            <span className="ty-suggest-kind">{kindAlbum}</span>
        </button>;
    }
    return <button type="button" className="ty-suggest-row" onClick={() => onSong(suggestion)}>
        <span className="ty-suggest-icon">{suggestion.coverUrl ? <img src={getSizedCoverUrl(suggestion.coverUrl, 96) || undefined} alt="" loading="lazy" /> : <Music2 size={18} />}</span>
        <span className="ty-suggest-copy">
            <span className="ty-suggest-title"><HighlightedText text={suggestion.name} query={query} /></span>
            {suggestion.artistName && <span className="ty-suggest-meta">{suggestion.artistName}</span>}
        </span>
        <span className="ty-suggest-kind">{kindSong}</span>
    </button>;
};

export default function SearchSuggestions({ items, query, status, historyMatches, onKeyword, onArtist, onAlbum, onSong }: Props) {
    const { t } = useTranslation();
    const keyword = query.trim();
    const kindSong = t('search.kindSong', '单曲');
    const kindArtist = t('search.kindArtist', '歌手');
    const kindAlbum = t('search.kindAlbum', '专辑');

    return <div className="ty-suggest-list" role="group" aria-label={t('search.suggestions', '搜索建议')}>
        {keyword && <button type="button" className="ty-suggest-row ty-suggest-search" onClick={() => onKeyword(keyword)}>
            <span className="ty-suggest-icon"><Search size={17} /></span>
            <span className="ty-suggest-copy">
                <span className="ty-suggest-title">{t('search.searchFor', { query: keyword, defaultValue: '搜索「{{query}}」' })}</span>
            </span>
            {status === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} className="ty-row-chevron" />}
        </button>}

        {items.map((suggestion, index) => <SuggestionRow
            key={`${suggestion.kind}:${index}`}
            suggestion={suggestion}
            query={query}
            onKeyword={onKeyword}
            onArtist={onArtist}
            onAlbum={onAlbum}
            onSong={onSong}
            kindSong={kindSong}
            kindArtist={kindArtist}
            kindAlbum={kindAlbum}
        />)}

        {status !== 'loading' && historyMatches.length > 0 && <div className="ty-suggest-history">
            <p className="ty-suggest-history-title">{t('search.fromHistory', '搜索历史')}</p>
            {historyMatches.map(term => <button type="button" key={term} className="ty-suggest-row" onClick={() => onKeyword(term)}>
                <span className="ty-suggest-icon"><Search size={17} /></span>
                <span className="ty-suggest-copy"><span className="ty-suggest-title"><HighlightedText text={term} query={query} /></span></span>
            </button>)}
        </div>}
    </div>;
}
