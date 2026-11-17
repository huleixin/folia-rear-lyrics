import { useCallback, useEffect, useRef } from 'react';
import { omni } from '../services/onlineMusic/omni';
import { handleLoginStatusFailure } from '../services/onlineMusic/loginStatusFailure';
import { clearProviderAccountSnapshot, loadProviderAccountSnapshot, saveProviderAccountSnapshot } from '../services/onlineMusic/providerAccountCache';
import { useOnlineProviderAccountStore, type OnlineProviderAccountState } from '../stores/useOnlineProviderAccountStore';
import type { MediaId, ProviderAvailability, ProviderCapabilities, ProviderCollection, ProviderPage, ProviderUser } from '../types/onlineMusic';
import { getQishuiAuthDiagnostics } from '../nativeBridge/api/qishui';

// src/hooks/useQishuiLibrary.ts

export type QishuiRecoveryPhase =
    | 'idle'
    | 'hydrating-snapshot'
    | 'verifying-session'
    | 'syncing-library'
    | 'complete'
    | 'failed';

const qishuiRecoveryDiagnostics = {
    recoveryStarted: false,
    phase: 'idle' as QishuiRecoveryPhase,
    finalStatus: 'unknown',
};

export function formatQishuiRecoveryDiagnosticLines(): string[] {
    const auth = getQishuiAuthDiagnostics();
    return [
        '',
        'qishui auth recovery:',
        `  recoveryStarted: ${qishuiRecoveryDiagnostics.recoveryStarted}`,
        `  phase: ${qishuiRecoveryDiagnostics.phase}`,
        `  hasPersistedSession: ${auth.hasPersistedSession}`,
        `  sessionSchemaValid: ${auth.sessionSchemaValid}`,
        `  deviceIdChanged: ${auth.deviceIdChanged}`,
        `  expiresRemainingMs: ${auth.expiresRemainingMs == null ? 'none' : auth.expiresRemainingMs}`,
        `  renewAttempted: ${auth.renewAttempted}`,
        `  loginCheckResult: ${auth.loginCheckResult}`,
        `  upstreamCode: ${auth.upstreamCode || '(none)'}`,
        `  sessionClearedReason: ${auth.sessionClearedReason || '(none)'}`,
        `  finalStatus: ${qishuiRecoveryDiagnostics.finalStatus}`,
    ];
}

export type QishuiLibraryRefreshDeps = {
    availability: ProviderAvailability;
    capabilities: ProviderCapabilities;
    cachedUser: ProviderUser | null;
    cachedLikes: MediaId[];
    checkLoginStatus: () => Promise<ProviderUser | null>;
    loadSnapshot: () => Promise<{ user: ProviderUser; collections: ProviderCollection[]; likedSongIds: MediaId[]; savedAt: number } | null>;
    saveSnapshot: (user: ProviderUser, collections: ProviderCollection[], likedSongIds: MediaId[]) => Promise<number>;
    clearSnapshot: () => Promise<void>;
    loadPlaylistPage: (userId: MediaId, offset: number, limit: number) => Promise<ProviderPage<ProviderCollection>>;
    loadLikedSongIds: (userId: MediaId) => Promise<MediaId[]>;
    getLatestLikes: () => MediaId[];
    updateAccount: (patch: Partial<OnlineProviderAccountState>) => void;
    clearAccount: (error?: string) => void;
    isStale?: () => boolean;
};

export async function recoverQishuiLibraryAccount(deps: QishuiLibraryRefreshDeps): Promise<boolean> {
    qishuiRecoveryDiagnostics.recoveryStarted = true;
    qishuiRecoveryDiagnostics.phase = 'verifying-session';

    if (!deps.availability.configured || !deps.capabilities.auth) {
        deps.clearAccount(deps.availability.reason);
        await deps.clearSnapshot();
        qishuiRecoveryDiagnostics.phase = 'complete';
        qishuiRecoveryDiagnostics.finalStatus = deps.availability.configured ? 'error' : 'anonymous';
        return false;
    }

    deps.updateAccount({
        status: deps.cachedUser ? 'authenticated' : 'unknown',
        hydration: deps.cachedUser ? 'ready' : 'loading',
        freshness: 'refreshing',
        error: undefined,
    });

    const user = await deps.checkLoginStatus();
    if (deps.isStale?.()) return false;
    if (!user) {
        const current = useOnlineProviderAccountStore.getState().accounts.qishui;
        qishuiRecoveryDiagnostics.phase = 'failed';
        qishuiRecoveryDiagnostics.finalStatus = current?.status || 'anonymous';
        return false;
    }

    if (!deps.cachedUser || String(deps.cachedUser.id) !== String(user.id)) {
        // Account identity changed or was unhydrated: clear any mismatched private metadata first.
        deps.clearAccount();
        const snapshot = await deps.loadSnapshot().catch(() => null);
        if (deps.isStale?.()) return false;
        const matching = snapshot && String(snapshot.user.id) === String(user.id) ? snapshot : null;
        deps.updateAccount({
            status: 'authenticated',
            user,
            collections: matching?.collections || [],
            likedSongIds: matching?.likedSongIds || [],
            hydration: 'ready',
            freshness: 'refreshing',
            lastUpdatedAt: matching?.savedAt,
            error: undefined,
        });
    }

    qishuiRecoveryDiagnostics.phase = 'syncing-library';
    const collections: ProviderCollection[] = [];
    let likedSongIds: MediaId[] = deps.cachedLikes;
    try {
        if (deps.capabilities.userLibrary) {
            let offset = 0;
            while (true) {
                const page = await deps.loadPlaylistPage(user.id, offset, 50);
                if (deps.isStale?.()) return false;
                collections.push(...page.items);
                if (!page.hasMore || page.nextOffset <= offset) break;
                offset = page.nextOffset;
            }
        }
        const fetchedLikes = deps.capabilities.likes ? await deps.loadLikedSongIds(user.id) : [];
        if (deps.isStale?.()) return false;
        const latestLikes = deps.getLatestLikes();
        likedSongIds = latestLikes === deps.cachedLikes ? fetchedLikes : latestLikes;

        deps.updateAccount({
            status: 'authenticated',
            user,
            collections,
            likedSongIds,
            hydration: 'ready',
            error: undefined,
        });
        const savedAt = await deps.saveSnapshot(user, collections, likedSongIds);
        if (deps.isStale?.()) return false;
        deps.updateAccount({ freshness: 'fresh', lastUpdatedAt: savedAt });
        qishuiRecoveryDiagnostics.phase = 'complete';
        qishuiRecoveryDiagnostics.finalStatus = 'authenticated';
        return true;
    } catch {
        if (deps.isStale?.()) return false;
        // A single playlist/likes endpoint failure must never drop the authenticated session.
        deps.updateAccount({
            status: 'authenticated',
            user,
            hydration: 'ready',
            freshness: 'error',
            error: 'qishui-refresh-failed',
        });
        qishuiRecoveryDiagnostics.phase = 'failed';
        qishuiRecoveryDiagnostics.finalStatus = 'authenticated';
        return false;
    }
}

export const useQishuiLibrary = () => {
    const updateAccount = useOnlineProviderAccountStore(state => state.updateAccount);
    const clearAccount = useOnlineProviderAccountStore(state => state.clearAccount);
    const generation = useRef(0);
    const pendingSave = useRef<Promise<unknown>>(Promise.resolve());
    const inFlightRefresh = useRef<Promise<boolean> | null>(null);

    const clearAuthState = useCallback(async (error?: string) => {
        clearAccount('qishui', error);
        await pendingSave.current.catch(() => {});
        await Promise.allSettled([omni.logout('qishui'), clearProviderAccountSnapshot('qishui')]);
    }, [clearAccount]);

    const checkLoginStatus = useCallback(async (): Promise<ProviderUser | null> => {
        const cachedAccount = useOnlineProviderAccountStore.getState().accounts.qishui;
        try {
            const user = await omni.getLoginStatus('qishui');
            if (!user) {
                await clearAuthState(cachedAccount?.user ? 'auth-required' : undefined);
                return null;
            }
            updateAccount('qishui', {
                status: 'authenticated',
                user,
                hydration: 'ready',
                error: undefined,
            });
            return user;
        } catch (error) {
            return handleLoginStatusFailure(error, {
                providerId: 'qishui',
                cachedUser: cachedAccount?.user,
                fallbackMessage: 'qishui_login_status_failed',
                clearAuthState,
                updateAccount: patch => updateAccount('qishui', patch),
            });
        }
    }, [clearAuthState, updateAccount]);

    const refresh = useCallback((): Promise<boolean> => {
        if (inFlightRefresh.current) return inFlightRefresh.current;
        const current = ++generation.current;
        const task = recoverQishuiLibraryAccount({
            availability: omni.getProviderAvailability('qishui'),
            capabilities: omni.getProviderCapabilities('qishui'),
            cachedUser: useOnlineProviderAccountStore.getState().accounts.qishui?.user || null,
            cachedLikes: useOnlineProviderAccountStore.getState().accounts.qishui?.likedSongIds || [],
            checkLoginStatus,
            loadSnapshot: () => loadProviderAccountSnapshot('qishui'),
            saveSnapshot: async (user, collections, likedSongIds) => {
                const save = pendingSave.current.catch(() => {}).then(() =>
                    saveProviderAccountSnapshot('qishui', { user, collections, likedSongIds }),
                );
                pendingSave.current = save;
                return (await save).savedAt;
            },
            clearSnapshot: async () => {
                await pendingSave.current.catch(() => {});
                await clearProviderAccountSnapshot('qishui');
            },
            loadPlaylistPage: (userId, offset, limit) => omni.getProviderUserPlaylists('qishui', userId, { offset, limit }),
            loadLikedSongIds: userId => omni.getProviderLikedSongIds('qishui', userId),
            getLatestLikes: () => useOnlineProviderAccountStore.getState().accounts.qishui.likedSongIds,
            updateAccount: patch => updateAccount('qishui', patch),
            clearAccount: error => clearAccount('qishui', error),
            isStale: () => generation.current !== current,
        }).finally(() => {
            if (inFlightRefresh.current === task) inFlightRefresh.current = null;
        });
        inFlightRefresh.current = task;
        return task;
    }, [checkLoginStatus, clearAccount, updateAccount]);

    const logout = useCallback(async () => {
        generation.current++;
        inFlightRefresh.current = null;
        await clearAuthState();
    }, [clearAuthState]);

    useEffect(() => {
        let cancelled = false;
        qishuiRecoveryDiagnostics.phase = 'hydrating-snapshot';
        void (async () => {
            const snapshot = await loadProviderAccountSnapshot('qishui').catch(() => null);
            if (cancelled) return;
            if (snapshot) {
                const user = omni.normalizeCachedUser('qishui', snapshot.user);
                if (user) {
                    const collections = snapshot.collections
                        .map(collection => omni.normalizeCachedCollection('qishui', collection, collection.type))
                        .filter(Boolean) as ProviderCollection[];
                    updateAccount('qishui', {
                        status: 'authenticated',
                        user,
                        collections,
                        likedSongIds: snapshot.likedSongIds || [],
                        hydration: 'ready',
                        freshness: 'stale',
                        lastUpdatedAt: snapshot.savedAt,
                        error: undefined,
                    });
                }
            }
            if (!cancelled) void refresh();
        })();
        const onOnline = () => {
            const acc = useOnlineProviderAccountStore.getState().accounts.qishui;
            if (acc?.freshness === 'error' || acc?.status === 'unknown') {
                void refresh();
            }
        };
        window.addEventListener('online', onOnline);
        return () => {
            cancelled = true;
            window.removeEventListener('online', onOnline);
        };
    }, [refresh, updateAccount]);

    return { refresh, logout, checkLoginStatus };
};
