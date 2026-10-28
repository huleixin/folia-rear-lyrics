import { getFromCache, removeFromCache, saveToCache } from './db';
import { createSafeObjectUrl, isBlob } from '../utils/blobGuards';
import {
    clearCoverAssets as clearStoredCoverAssets,
    getCoverAssetUsage,
    readCoverAsset,
    removeCoverAsset,
    writeCoverAsset,
    type BinaryAssetWriteResult,
} from './binaryAssetStore';

interface StoredCoverDescriptor extends BinaryAssetWriteResult { }

const isStoredCoverDescriptor = (value: unknown): value is StoredCoverDescriptor => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<StoredCoverDescriptor>;
    return (candidate.backend === 'opfs' || candidate.backend === 'electron')
        && typeof candidate.mimeType === 'string'
        && typeof candidate.size === 'number'
        && typeof candidate.updatedAt === 'number';
};

const buildCoverRequestUrl = (coverUrl: string): string => {
    if (typeof window !== 'undefined' && window.electron) return coverUrl;
    try {
        const hostname = new URL(coverUrl).hostname;
        if (hostname === 'y.gtimg.cn'
            || hostname === 'kugou.com' || hostname.endsWith('.kugou.com')
            || hostname === 'kgimg.com' || hostname.endsWith('.kgimg.com')) {
            return `/api/lyric-proxy?url=${encodeURIComponent(coverUrl)}`;
        }
    } catch {
        return coverUrl;
    }
    return coverUrl;
};

const fetchCoverBlob = async (coverUrl: string): Promise<Blob> => {
    const response = await fetch(buildCoverRequestUrl(coverUrl), { mode: 'cors' });
    if (response.ok === false) throw new Error(`Cover request failed: ${response.status}`);
    return await response.blob();
};

async function readCachedCoverBlob(cacheKey: string): Promise<Blob | null> {
    const stored = await getFromCache<unknown>(cacheKey);
    if (isBlob(stored)) {
        const descriptor = await writeCoverAsset(cacheKey, stored).catch(() => null);
        if (!descriptor) {
            return stored;
        }
        await saveToCache(cacheKey, descriptor);
        return stored;
    }

    if (stored !== null && !isStoredCoverDescriptor(stored)) {
        await removeFromCache(cacheKey);
        await removeCoverAsset(cacheKey);
        return null;
    }

    const cachedCover = await readCoverAsset(cacheKey, isStoredCoverDescriptor(stored) ? stored.mimeType : undefined);
    if (!cachedCover) {
        if (stored) await removeFromCache(cacheKey);
        return null;
    }
    return cachedCover;
}

/**
 * Whether a cover is already stored, without minting an object URL to find out.
 *
 * `getCachedCoverUrl` is the wrong question to ask when nothing is going to be displayed: it reads
 * the bytes and hands back a URL that a caller checking for mere existence then has to remember to
 * revoke. Reads the descriptor only, and accepts the legacy raw-Blob shape the same way the reader
 * above does, so a cover written before the asset store existed still counts as cached.
 */
export async function hasCachedCover(cacheKey: string): Promise<boolean> {
    const stored = await getFromCache<unknown>(cacheKey);
    return isBlob(stored) || isStoredCoverDescriptor(stored);
}

// Coalesce file reads and downloads. Each caller still owns its own object URL, so
// existing revokeObjectURL cleanup cannot invalidate a different page's artwork.
const blobReads = new Map<string, Promise<Blob | null>>();
const downloads = new Map<string, Promise<Blob>>();
let residentBytes = 0;
const residentSizes = new Map<string, number>();
function forgetCover(key: string) {
    blobReads.delete(key); downloads.delete(key);
    residentBytes -= residentSizes.get(key) ?? 0; residentSizes.delete(key);
}
function rememberCover(key: string, load: Promise<Blob | null>): Promise<Blob | null> {
    blobReads.set(key, load);
    void load.then(blob => {
        if (blobReads.get(key) !== load) return;
        if (!blob) { blobReads.delete(key); return; }
        residentSizes.set(key, blob.size); residentBytes += blob.size;
        while (blobReads.size > 64 || residentBytes > 8 * 1024 * 1024) {
            const oldest = blobReads.keys().next().value;
            if (oldest === undefined) break;
            forgetCover(oldest);
        }
    }, () => { if (blobReads.get(key) === load) forgetCover(key); });
    return load;
}
export async function getCachedCoverUrl(cacheKey: string): Promise<string | null> {
    const blob = await (blobReads.get(cacheKey) ?? rememberCover(cacheKey, readCachedCoverBlob(cacheKey)));
    return createSafeObjectUrl(blob);
}
export async function loadCachedOrFetchCover(cacheKey: string, coverUrl?: string | null): Promise<string | null> {
    if (!coverUrl) return null;
    try {
        const cached = await getCachedCoverUrl(cacheKey);
        if (cached) return cached;
        let job = downloads.get(cacheKey);
        if (!job) {
            job = (async () => {
                const blob = await fetchCoverBlob(coverUrl);
                const descriptor = await writeCoverAsset(cacheKey, blob).catch(() => null);
                if (descriptor) await saveToCache(cacheKey, descriptor);
                rememberCover(cacheKey, Promise.resolve(blob));
                return blob;
            })();
            downloads.set(cacheKey, job);
            void job.finally(() => { if (downloads.get(cacheKey) === job) downloads.delete(cacheKey); }).catch(() => {});
        }
        return createSafeObjectUrl(await job) || coverUrl;
    } catch (error) {
        console.warn('Failed to cache cover:', error);
        return coverUrl;
    }
}

export async function saveCoverBlob(cacheKey: string, coverBlob: Blob): Promise<void> {
    forgetCover(cacheKey);
    const descriptor = await writeCoverAsset(cacheKey, coverBlob).catch(() => null);
    if (descriptor) {
        await saveToCache(cacheKey, descriptor);
        return;
    }
    await saveToCache(cacheKey, coverBlob);
}

// Replaces the cached online cover used by local-song playback without changing the audio file.
export async function cacheLocalSongOnlineCover(songId: string, coverUrl: string): Promise<boolean> {
    const cacheKey = `cover_local_${songId}`;
    await removeCachedCover(cacheKey);
    try {
        const descriptor = await writeCoverAsset(cacheKey, await fetchCoverBlob(coverUrl));
        if (!descriptor) return false;
        await saveToCache(cacheKey, descriptor);
        return true;
    } catch (error) {
        console.warn('[LocalMusic] Failed to cache matched cover:', error);
        return false;
    }
}

export async function removeCachedCover(cacheKey: string): Promise<void> {
    forgetCover(cacheKey);
    await Promise.all([removeFromCache(cacheKey), removeCoverAsset(cacheKey)]);
}

export async function clearCoverAssets(): Promise<void> {
    blobReads.clear(); downloads.clear(); residentSizes.clear(); residentBytes = 0;
    await clearStoredCoverAssets();
}
export { getCoverAssetUsage };
