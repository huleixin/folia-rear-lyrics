import { useEffect, useState } from 'react';
import { ChevronDown, Flame, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SearchSource } from '../../../stores/useSearchNavigationStore';
import { useSearchHistoryStore } from '../../../stores/useSearchHistoryStore';
import { omni } from '../../../services/onlineMusic/omni';
import { loadSearchDiscovery, type SearchDiscovery } from '../../../services/search/searchAuxiliary';
import { useSearchAuxiliaryKey } from './useSearchAuxiliaryKey';

// src/components/app/search/SearchLanding.tsx

export { loadSearchDiscovery } from '../../../services/search/searchAuxiliary';
const EMPTY: string[] = [];

export default function SearchLanding({ source, onSearch }: { source: SearchSource; onSearch: (query: string) => void }) {
    const { t } = useTranslation();
    const terms = useSearchHistoryStore(state => state.terms[source] ?? EMPTY);
    const scope = useSearchAuxiliaryKey(source, 'discovery');
    const [snapshot, setSnapshot] = useState<{ key: string; data: SearchDiscovery } | null>(null);
    const data = snapshot?.key === scope ? snapshot.data : null;
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
        let active = true;
        setSnapshot(null); setFailed(false); setExpanded(false);
        if (source !== 'local' && source !== 'navidrome') {
            loadSearchDiscovery(source).then(value => { if (active) setSnapshot({ key: scope, data: value }); }).catch(() => { if (active) setFailed(true); });
        }
        return () => { active = false; };
    }, [source, scope, attempt]);
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
        {source !== 'local' && source !== 'navidrome' && data?.providerId !== null && <section className="ty-trending">
            <div className="ty-landing-head"><h2 className="ty-landing-title"><Flame size={19} />{t('mobileEnhancements.hotSearch')}</h2><span className="ty-landing-source">{data?.providerId ? omni.getProviderLabel(data.providerId) : ''}</span></div>
            <div className="ty-hot">{data?.hot.slice(0, expanded ? undefined : 10).map((word, index) => <button key={`${index}:${word}`} onClick={() => onSearch(word)} data-leading={index < 3 || undefined}><span className="ty-hot-index">{index + 1}</span><span className="ty-hot-word">{word}</span></button>)}</div>
            {data && data.hot.length > 10 && <button className="ty-hot-expand" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{t(expanded ? 'mobileLibrary.collapseHot' : 'mobileLibrary.expandHot')}<ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : undefined }} /></button>}
            {failed && <button className="ty-landing-retry" onClick={() => setAttempt(value => value + 1)}>{t('mobileEnhancements.searchUnavailable')} · {t('search.retry')}</button>}
            {!failed && data?.hot.length === 0 && <p className="ty-section-error">{t('home.noResults')}</p>}
            {!failed && !data && <p className="ty-section-error" role="status">{t('localMusic.searching')}</p>}
        </section>}
    </div>;
}
