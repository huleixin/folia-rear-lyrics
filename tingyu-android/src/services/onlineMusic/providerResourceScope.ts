import { useOnlineProviderAccountStore } from '../../stores/useOnlineProviderAccountStore';
import { getNavidromeConfig } from '../navidromeService';

// src/services/onlineMusic/providerResourceScope.ts
const generations = new Map<string, number>();
export function invalidateProviderResources(providerId: string): void {
    generations.set(providerId, (generations.get(providerId) || 0) + 1);
}
useOnlineProviderAccountStore.subscribe((state, previous) => {
    for (const id of new Set([...Object.keys(state.accounts), ...Object.keys(previous.accounts)])) {
        const next = state.accounts[id], before = previous.accounts[id];
        if (next?.user?.id !== before?.user?.id || next?.status !== before?.status
            || next?.hydration !== before?.hydration || next?.collections !== before?.collections) invalidateProviderResources(id);
    }
});
export function providerResourceScope(providerId: string) {
    const account = useOnlineProviderAccountStore.getState().accounts[providerId];
    return { userId: account?.user?.id ?? null, generation: generations.get(providerId) || 0,
        ready: account?.hydration === 'ready', authenticated: account?.status === 'authenticated' };
}
export function providerScopeKey(sources: string[]): string {
    return JSON.stringify(sources.map(id => [id, id === 'local' ? null : id === 'navidrome' ? navidromeScope() : providerResourceScope(id)]));
}
function navidromeScope() {
    const config = getNavidromeConfig();
    if (!config) return null;
    try {
        const url = new URL(config.serverUrl);
        return [url.origin + url.pathname, config.username];
    } catch { return ['invalid-server', config.username]; }
}
// Search depends on account identity/access, not collection edits or unrelated account updates.
export function providerSearchScopeKey(sources: string[], accounts = useOnlineProviderAccountStore.getState().accounts): string {
    return JSON.stringify(sources.map(id => {
        const account = accounts[id];
        return [id, id === 'local' ? null : id === 'navidrome' ? navidromeScope()
            : [account?.user?.id ?? null, account?.status ?? null, account?.hydration ?? null]];
    }));
}
