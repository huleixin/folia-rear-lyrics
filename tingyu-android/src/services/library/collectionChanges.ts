// src/services/library/collectionChanges.ts
export type CollectionChange = { providerId: string; collectionId?: string };
const listeners = new Set<(change: CollectionChange) => void>();
export const subscribeCollectionChanges = (listener: (change: CollectionChange) => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};
export function notifyCollectionChanged(change: CollectionChange): void {
    // A stale view must not turn a successful remote write into a reported failure.
    listeners.forEach(listener => {
        try { listener(change); } catch { console.warn('Collection subscriber update failed'); }
    });
}
