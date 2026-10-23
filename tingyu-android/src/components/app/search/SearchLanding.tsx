import { useEffect, useState } from 'react';
import { ChevronDown, Flame, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SearchSource } from '../../../stores/useSearchNavigationStore';
import { useSearchHistoryStore } from '../../../stores/useSearchHistoryStore';
import { omni } from '../../../services/onlineMusic/omni';

// src/components/app/search/SearchLanding.tsx

type Discovery = { suggestions: string[]; hot: string[] };
const cache = new Map<string, { data: Discovery; saved: number }>();
const pending = new Map<string, Promise<Discovery>>();
const EMPTY: string[] = [];

function discovery(source: Exclude<SearchSource, 'local' | 'navidrome'>) {
    const saved = cache.get(source);
    if (saved && Date.now() - saved.saved < 600_000) return Promise.resolve(saved.data);
    let request = pending.get(source);
    if (!request) {
        request = omni.getSearchDiscovery(source).then(data => {
            cache.set(source, { data, saved: Date.now() });
            return data;
        }).finally(() => pending.delete(source));
        pending.set(source, request);
    }
    return request;
}

export default function SearchLanding({ source, onSearch }: { source: SearchSource; onSearch: (query: string) => void }) {
    const { t } = useTranslation();
    const terms = useSearchHistoryStore(state => state.terms[source] ?? EMPTY);
    const [data, setData] = useState<Discovery | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
        let active = true;
        setData(null); setFailed(false); setExpanded(false);
        if (source !== 'local' && source !== 'navidrome') {
            discovery(source).then(value => { if (active) setData(value); }).catch(() => { if (active) setFailed(true); });
        }
        return () => { active = false; };
    }, [source, attempt]);
    return <div className="ty-landing">
        {terms.length > 0 && <section className="ty-history">
            <div className="ty-landing-head"><h2 className="ty-landing-title">{t('mobileEnhancements.history')}</h2>
                <button className="ty-landing-icon" aria-label={t('mobileEnhancements.clearHistory')} onClick={() => useSearchHistoryStore.getState().clear(source)}><Trash2 size={17} /></button></div>
            <div className="ty-chips">{terms.map(term => <div key={term} className="ty-chip">
                <button onClick={() => onSearch(term)}>{term}</button>
                <button aria-label={t('mobileEnhancements.removeHistory', { query: term })} onClick={() => useSearchHistoryStore.getState().remove(source, term)}><X size={13} /></button>
            </div>)}</div>
        </section>}
        {!!data?.suggestions.length && <section className="ty-discovery">
            <div className="ty-landing-head"><h2 className="ty-landing-title">{t('mobileEnhancements.discover')}</h2></div>
            <div className="ty-chips">{data.suggestions.map(word => <div className="ty-chip" key={word}><button onClick={() => onSearch(word)}>{word}</button></div>)}</div>
        </section>}
        {source !== 'local' && source !== 'navidrome' && <section className="ty-trending">
            <div className="ty-landing-head"><h2 className="ty-landing-title"><Flame size={19} />{t('mobileEnhancements.hotSearch')}</h2><span className="ty-landing-source">{omni.getProviderLabel(source)}</span></div>
            <div className="ty-hot">{data?.hot.slice(0, expanded ? undefined : 10).map((word, index) => <button key={`${index}:${word}`} onClick={() => onSearch(word)} data-leading={index < 3 || undefined}><span className="ty-hot-index">{index + 1}</span><span className="ty-hot-word">{word}</span></button>)}</div>
            {data && data.hot.length > 10 && <button className="ty-hot-expand" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{t(expanded ? 'mobileLibrary.collapseHot' : 'mobileLibrary.expandHot')}<ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : undefined }} /></button>}
            {failed && <button className="ty-landing-retry" onClick={() => setAttempt(value => value + 1)}>{t('mobileEnhancements.searchUnavailable')} · {t('search.retry')}</button>}
            {!failed && data?.hot.length === 0 && <p className="ty-section-error">{t('home.noResults')}</p>}
            {!failed && !data && <p className="ty-section-error" role="status">{t('localMusic.searching')}</p>}
        </section>}
    </div>;
}
