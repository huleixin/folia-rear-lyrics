import { useCallback, useEffect, useRef } from 'react';
import { omni } from '../services/onlineMusic/omni';
import { clearProviderAccountSnapshot, loadProviderAccountSnapshot, saveProviderAccountSnapshot } from '../services/onlineMusic/providerAccountCache';
import { useOnlineProviderAccountStore } from '../stores/useOnlineProviderAccountStore';
import { OnlineProviderError } from '../types/onlineMusic';
import type { MediaId, ProviderCollection } from '../types/onlineMusic';

// src/hooks/useQishuiLibrary.ts

export const useQishuiLibrary = () => {
    const active = useOnlineProviderAccountStore(state => state.activeProviderId);
    const generation = useRef(0);
    const pendingSave = useRef<Promise<unknown>>(Promise.resolve());
    const refresh = useCallback(async () => {
        const current = ++generation.current;
        const store = useOnlineProviderAccountStore.getState();
        try {
            if (!omni.getProviderAvailability('qishui').configured || !omni.getProviderCapabilities('qishui').auth) {
                store.clearAccount('qishui');
                await pendingSave.current.catch(() => {});
                await clearProviderAccountSnapshot('qishui');
                return false;
            }
            store.updateAccount('qishui', { freshness: 'refreshing', error: undefined });
            const user = await omni.getLoginStatus('qishui');
            if (generation.current !== current) return false;
            if (!user) {
                store.clearAccount('qishui');
                await pendingSave.current.catch(() => {});
                await clearProviderAccountSnapshot('qishui');
                return false;
            }
            // Restore public metadata only after the main-process session identifies the same account.
            const visibleUser = useOnlineProviderAccountStore.getState().accounts.qishui?.user;
            if (!visibleUser || String(visibleUser.id) !== String(user.id)) {
                store.clearAccount('qishui');
                const snapshot = await loadProviderAccountSnapshot('qishui').catch(() => null);
                if (generation.current !== current) return false;
                const matching = snapshot && String(snapshot.user.id) === String(user.id) ? snapshot : null;
                store.updateAccount('qishui', { status: 'authenticated', user,
                    collections: matching?.collections || [], likedSongIds: matching?.likedSongIds || [],
                    hydration: 'ready', freshness: 'refreshing', lastUpdatedAt: matching?.savedAt, error: undefined });
            }
            const likesBeforeRefresh = useOnlineProviderAccountStore.getState().accounts.qishui.likedSongIds;
            const collections: ProviderCollection[] = [];
            const capabilities = omni.getProviderCapabilities('qishui');
            let offset = 0;
            if (capabilities.userLibrary) {
                while (true) {
                    const page = await omni.getProviderUserPlaylists('qishui', user.id, { offset, limit: 50 });
                    if (generation.current !== current) return false;
                    collections.push(...page.items);
                    if (!page.hasMore || page.nextOffset <= offset) break;
                    offset = page.nextOffset;
                }
            }
            const fetchedLikedSongIds: MediaId[] = capabilities.likes ? await omni.getProviderLikedSongIds('qishui', user.id) : [];
            if (generation.current !== current) return false;
            const save = pendingSave.current.catch(() => {}).then(() => {
                if (generation.current !== current) return null;
                // Omni replaces this array after each like mutation; keep those newer changes.
                const latestLikes = useOnlineProviderAccountStore.getState().accounts.qishui.likedSongIds;
                const likedSongIds = latestLikes === likesBeforeRefresh ? fetchedLikedSongIds : latestLikes;
                // Commit before saving so a mutation during persistence cannot be overwritten afterward.
                store.updateAccount('qishui', { status: 'authenticated', user, collections, likedSongIds,
                    hydration: 'ready', error: undefined });
                return saveProviderAccountSnapshot('qishui', { user, collections, likedSongIds });
            });
            pendingSave.current = save;
            const saved = await save;
            if (generation.current !== current) return false;
            if (!saved) return false;
            store.updateAccount('qishui', { freshness: 'fresh', lastUpdatedAt: saved.savedAt });
            return true;
        } catch (error) {
            if (generation.current !== current) return false;
            if (error instanceof OnlineProviderError && error.code === 'auth-required') {
                store.clearAccount('qishui', 'auth-required');
                await pendingSave.current.catch(() => {});
                await clearProviderAccountSnapshot('qishui');
            } else store.updateAccount('qishui', { hydration: 'ready', freshness: 'error',
                status: useOnlineProviderAccountStore.getState().accounts.qishui?.user ? 'authenticated' : 'error', error: 'qishui-refresh-failed' });
            return false;
        }
    }, []);
    const logout = useCallback(async () => {
        generation.current++;
        useOnlineProviderAccountStore.getState().clearAccount('qishui');
        await pendingSave.current.catch(() => {});
        await Promise.all([omni.logout('qishui'), clearProviderAccountSnapshot('qishui')]);
    }, []);
    useEffect(() => {
        // Check the desktop session before displaying cached account metadata.
        if (active === 'qishui') void refresh();
        return () => { generation.current++; };
    }, [active, refresh]);
    return { refresh, logout };
};
