import { omni } from '../../../services/onlineMusic/omni';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { UnifiedLibrary, type LibraryScope } from './unifiedLibrary';

// src/library/core/services/unifiedLibrarySource.ts
const generations = new Map<string, number>();
export function invalidateUnifiedLibrary(providerId: string): void {
    generations.set(providerId, (generations.get(providerId) || 0) + 1);
}

// Includes logout/relogin of the same user and successful collection mutations.
useOnlineProviderAccountStore.subscribe((state, previous) => {
    for (const id of new Set([...Object.keys(state.accounts), ...Object.keys(previous.accounts)])) {
        const next = state.accounts[id], before = previous.accounts[id];
        if (next?.user?.id !== before?.user?.id || next?.status !== before?.status
            || next?.hydration !== before?.hydration || next?.collections !== before?.collections) {
            invalidateUnifiedLibrary(id);
        }
    }
});

export function libraryScope(providerId: string): LibraryScope {
    const account = useOnlineProviderAccountStore.getState().accounts[providerId];
    return { userId: account?.user?.id ?? null, generation: generations.get(providerId) || 0,
        ready: account?.hydration === 'ready', authenticated: account?.status === 'authenticated' };
}

export const unifiedLibrary = new UnifiedLibrary({
    scope: libraryScope,
    supports: (id, resource) => {
        try { return omni.getLibraryCapabilities(id)[resource] && omni.getProviderAvailability(id).configured; }
        catch { return false; }
    },
    read: (id, userId, resource, limit, offset) => resource === 'albums'
        ? omni.getProviderUserAlbums(id, userId, { limit, offset })
        : omni.getProviderUserPlaylists(id, userId, { limit, offset }),
});
