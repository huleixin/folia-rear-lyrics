import type { MediaId, OnlineProviderId, ProviderCollection, ProviderUser } from '../../types/onlineMusic';
import { getFromCache, removeFromCache, saveToCache } from '../db';
import { getProviderCacheKey } from './providerStorage';

// src/services/onlineMusic/providerAccountCache.ts

const SNAPSHOT_VERSION = 1;
const SNAPSHOT_CACHE_NAME = 'user_home_snapshot';
// Serialize writes and logout removal per provider so an earlier write cannot resurrect a cleared account.
const pendingWrites = new Map<string, Promise<unknown>>();
function enqueueSnapshotWrite<T>(providerId: string, write: () => Promise<T>): Promise<T> {
    const task = (pendingWrites.get(providerId) ?? Promise.resolve()).catch(() => undefined).then(write);
    pendingWrites.set(providerId, task);
    void task.finally(() => {
        if (pendingWrites.get(providerId) === task) pendingWrites.delete(providerId);
    }).catch(() => undefined);
    return task;
}

export type ProviderAccountSnapshot = {
    version: 1;
    savedAt: number;
    user: ProviderUser;
    collections: ProviderCollection[];
    likedSongIds: MediaId[];
};

const isUsableMediaId = (value: unknown): value is MediaId => (
    (typeof value === 'string' && value.length > 0) || (typeof value === 'number' && Number.isFinite(value))
);

export const getProviderAccountSnapshotCacheKey = (providerId: OnlineProviderId): string => (
    getProviderCacheKey(providerId, SNAPSHOT_CACHE_NAME)
);

export const loadProviderAccountSnapshot = async (
    providerId: OnlineProviderId,
): Promise<ProviderAccountSnapshot | null> => {
    await pendingWrites.get(providerId)?.catch(() => undefined);
    const cached = await getFromCache<ProviderAccountSnapshot>(getProviderAccountSnapshotCacheKey(providerId));
    if (!cached || cached.version !== SNAPSHOT_VERSION || !cached.user) return null;
    if (!Array.isArray(cached.collections) || !Array.isArray(cached.likedSongIds)) return null;
    // 歌单内行号（KuGou fileid）只在本次会话有效，旧版本写进来的一律不还原，由刷新重建。
    const { likedSongFileIds: _sessionScopedRowIds, ...snapshot } = cached as ProviderAccountSnapshot & {
        likedSongFileIds?: unknown;
    };
    // 缓存可能是上一版本、另一台设备或被改坏的文件写的。坏元素单独剔除就够了，
    // 为一个空字符串丢掉整份快照会让首页白屏到刷新结束。
    return { ...snapshot, likedSongIds: snapshot.likedSongIds.filter(isUsableMediaId) };
};

export const saveProviderAccountSnapshot = async (
    providerId: OnlineProviderId,
    snapshot: Omit<ProviderAccountSnapshot, 'version' | 'savedAt'>,
    assertCurrent?: () => void,
): Promise<ProviderAccountSnapshot> => {
    const value: ProviderAccountSnapshot = {
        version: SNAPSHOT_VERSION,
        savedAt: Date.now(),
        ...snapshot,
    };
    await enqueueSnapshotWrite(providerId, async () => {
        assertCurrent?.();
        await saveToCache(getProviderAccountSnapshotCacheKey(providerId), value);
    });
    return value;
};

export const clearProviderAccountSnapshot = async (providerId: OnlineProviderId): Promise<void> => {
    await enqueueSnapshotWrite(providerId, () => removeFromCache(getProviderAccountSnapshotCacheKey(providerId)));
};
