import { useEffect, useMemo, useState } from 'react';
import type { SongResult } from '../../../types';
import type { MediaId, OnlineProviderId, ProviderCollection } from '../../../types/onlineMusic';
import type { LibraryCollectionDescriptor, OnlineGridViewCollectionDescriptor } from '../contracts/collection';
import type { LibraryHomeCard } from '../contracts/homeModel';
import type { CollectionResource } from '../contracts/resource';
import { collectionResourceRegistry } from '../services/collectionResourceRegistry';
import { createCollectionResource, resolveCollectionResourceKey } from '../services/createCollectionResource';
import { createStaticCollectionResource } from '../services/staticCollectionResource';

// src/library/core/bindings/useCollectionResource.ts
// 宿主用：为当前打开的集合拿到资源并持有它。renderer 只接收资源对象并自己订阅，
// 所以切换 renderer 不会释放资源、不会重新请求；宿主本身也不订阅快照，不会因为分页重渲染。

type UseCollectionResourceParams = {
    descriptor: LibraryCollectionDescriptor | null;
    currentUserId?: MediaId | null;
    /** 本地集合的曲目由宿主在渲染期算好，直接包成静态资源。 */
    localTracks?: SongResult[];
};

export const useCollectionResource = ({
    descriptor,
    currentUserId,
    localTracks,
}: UseCollectionResourceParams): CollectionResource | null => {
    const key = descriptor ? resolveCollectionResourceKey(descriptor, currentUserId) : null;
    const isLocal = descriptor?.source === 'local';
    // 资源被 registry 回收时（例如长时间只 peek 未 retain），换一代重新拿。
    const [peekEpoch, setPeekEpoch] = useState(0);

    const resource = useMemo(() => {
        if (!descriptor || !key) return null;
        if (isLocal) return createStaticCollectionResource(key, localTracks ?? []);
        return collectionResourceRegistry.peekOrCreate(key, descriptor, () => createCollectionResource(key, descriptor));
        // descriptor 本身不进依赖：同一个 key 下的描述变化由 ensure 处理（按版本决定是否重新加载）。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, isLocal, localTracks, peekEpoch]);

    useEffect(() => {
        if (!resource || resource.kind === 'static') return;
        const release = collectionResourceRegistry.retain(resource);
        if (!release) {
            setPeekEpoch(epoch => epoch + 1);
            return;
        }
        return release;
    }, [resource]);

    useEffect(() => {
        if (resource && descriptor) {
            resource.ensure(descriptor, { currentUserId });
        }
    }, [currentUserId, descriptor, resource]);

    return resource;
};

/** 首页首屏歌单缓存预热：仅把已在本地 IndexedDB 命中的歌单提前装入资源表，不发网络请求。 */
export const useWarmCachedOnlineCollections = (
    cards: LibraryHomeCard[],
    providerId: OnlineProviderId,
    currentUserId?: MediaId | null,
    enabled = true,
) => {
    useEffect(() => {
        if (!enabled || !cards.length) return;
        let cancelled = false;
        void (async () => {
            for (const card of cards) {
                if (cancelled) return;
                const raw = (card.raw ?? null) as Partial<ProviderCollection> | null;
                const descriptor: OnlineGridViewCollectionDescriptor = {
                    source: 'online',
                    providerId,
                    id: card.id,
                    name: card.name,
                    type: card.type === 'album' ? 'album' : 'playlist',
                    coverUrl: card.coverUrl,
                    description: card.description,
                    trackCount: card.trackCount,
                    updatedAt: raw?.updatedAt,
                    tracksUpdatedAt: raw?.tracksUpdatedAt,
                    creator: raw?.creator,
                    providerData: raw?.providerData,
                    raw: card.raw,
                };
                const key = resolveCollectionResourceKey(descriptor, currentUserId);
                const resource = collectionResourceRegistry.peekOrCreate(key, descriptor, () => createCollectionResource(key, descriptor));
                const release = collectionResourceRegistry.retain(resource);
                try {
                    await resource.warmCache?.(descriptor, { currentUserId });
                } finally {
                    release?.();
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [cards, currentUserId, enabled, providerId]);
};
