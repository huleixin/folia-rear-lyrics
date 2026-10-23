import { useEffect, useRef, useState } from 'react';
import type { OnlineProviderId } from '../../../types/onlineMusic';
import type { SearchSuggestions } from '../../../types/search';
import { omni } from '../../../services/onlineMusic/omni';
import type { SearchSource } from '../../../stores/useSearchNavigationStore';
import { sourceSupportsSuggestions } from '../../../stores/useSearchExploreStore';

// src/components/app/search/useSearchSuggestions.ts
// 输入联想的请求管理：防抖 300ms、序号失效、缓存、输入清空即停。
// 只在音源真正声明了 suggestKeywords 时发请求；本地与 Navidrome 不发。

export const SUGGEST_DEBOUNCE_MS = 300;
const CACHE_TTL_MS = 5 * 60_000;
const MIN_QUERY_LENGTH = 1;

type CacheEntry = { data: SearchSuggestions; savedAt: number };
const cache = new Map<string, CacheEntry>();

const cacheKey = (source: SearchSource, query: string) => `${source}\u0000${query.trim().toLowerCase()}`;

const readCache = (key: string): SearchSuggestions | null => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.data;
};

/** 只给测试与音源切换用：缓存里的条目属于上一段会话或旧音源。 */
export const clearSuggestionCache = (): void => {
    cache.clear();
};

/** `unavailable` = 这个音源没有可用的联想接口，或请求失败；界面按「没有建议」处理，不显示错误卡片。 */
export type SuggestionStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface SuggestionState {
    status: SuggestionStatus;
    items: SearchSuggestions['items'];
    error: boolean;
}

const EMPTY: SearchSuggestions['items'] = [];

/**
 * `query` 是当前输入值；`enabled` 控制「只在输入阶段联想」，提交搜索或失焦后可以关掉。
 * 组合输入（中文拼音）期间调用方应把 `enabled` 置 false，由 compositionend 之后的值触发。
 */
export function useSearchSuggestions({
    query,
    source,
    enabled,
}: {
    query: string;
    source: SearchSource;
    enabled: boolean;
}): SuggestionState {
    const [state, setState] = useState<SuggestionState & { key?: string }>({ status: 'idle', items: EMPTY, error: false });
    const generation = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const trimmed = query.trim();
        const current = ++generation.current;
        abortRef.current?.abort();
        abortRef.current = null;

        if (!enabled || trimmed.length < MIN_QUERY_LENGTH || !sourceSupportsSuggestions(source)) {
            setState(previous => (previous.status === 'idle' && previous.items.length === 0
                ? previous
                : { status: 'idle', items: EMPTY, error: false }));
            return;
        }

        const key = cacheKey(source, trimmed);
        const cached = readCache(key);
        if (cached) {
            setState({ key, status: 'ready', items: cached.items, error: false });
            return;
        }

        setState({ key, status: 'loading', items: EMPTY, error: false });
        const timer = setTimeout(() => {
            if (generation.current !== current) return;
            const controller = new AbortController();
            abortRef.current = controller;
            const request = omni.suggestProvider(source as OnlineProviderId, trimmed, controller.signal)
                .then(result => {
                    if (!controller.signal.aborted) {
                        cache.set(key, { data: result, savedAt: Date.now() });
                        if (cache.size > 80) cache.delete(cache.keys().next().value!);
                    }
                    return result;
                });
            request.then(result => {
                if (generation.current !== current) return;
                setState({ key, status: 'ready', items: result.items, error: false });
            }).catch(error => {
                if (generation.current !== current) return;
                if (error instanceof DOMException && error.name === 'AbortError') return;
                // 联想失败只记日志：界面退回「搜索当前关键词」，不弹错误提示。
                console.warn('[SearchSuggestions] failed:', error);
                setState({ key, status: 'unavailable', items: EMPTY, error: true });
            });
        }, SUGGEST_DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
            abortRef.current?.abort();
            abortRef.current = null;
        };
    }, [enabled, query, source]);

    // Render-time ownership check also prevents a stale frame before effect cleanup runs.
    if (!enabled || !query.trim() || !sourceSupportsSuggestions(source)) return { status: 'idle', items: EMPTY, error: false };
    return state.key === cacheKey(source, query) ? state : { status: 'loading', items: EMPTY, error: false };
}
