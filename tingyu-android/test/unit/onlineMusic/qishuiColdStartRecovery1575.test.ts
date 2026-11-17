import { describe, expect, it, vi, beforeEach } from 'vitest';
import { recoverQishuiLibraryAccount, formatQishuiRecoveryDiagnosticLines } from '../../../src/hooks/useQishuiLibrary';
import { resolveAccountDisplayState } from '../../../src/components/modal/settings/PlatformAccountsPage';
import { useOnlineProviderAccountStore } from '../../../src/stores/useOnlineProviderAccountStore';
import type { ProviderUser } from '../../../src/types/onlineMusic';

const userA: ProviderUser = { id: 'qs-1001', nickname: '汽水用户A' };

describe('1.5.75 Qishui cold-start account recovery & display states', () => {
    beforeEach(() => {
        useOnlineProviderAccountStore.getState().clearAccount('qishui');
    });

    it('recovers Qishui account even when activeProviderId is qq or netease', async () => {
        useOnlineProviderAccountStore.getState().setActiveProviderId('qq');
        const updateAccount = vi.fn((patch) => useOnlineProviderAccountStore.getState().updateAccount('qishui', patch));
        const clearAccount = vi.fn((err) => useOnlineProviderAccountStore.getState().clearAccount('qishui', err));

        const cachedLikes = ['t1'];
        const ok = await recoverQishuiLibraryAccount({
            availability: { configured: true },
            capabilities: {
                auth: true, qrLogin: true, userLibrary: true, likes: true, search: true,
                playlists: true, artists: true, albums: true, recommend: true, fm: true,
                charts: true, songUrl: true, lyrics: true, comments: false,
            } as never,
            cachedUser: userA,
            cachedLikes,
            checkLoginStatus: async () => userA,
            loadSnapshot: async () => ({ user: userA, collections: [], likedSongIds: cachedLikes, savedAt: 1000 }),
            saveSnapshot: async () => 2000,
            clearSnapshot: async () => {},
            loadPlaylistPage: async () => ({ items: [], hasMore: false, nextOffset: 0 }),
            loadLikedSongIds: async () => ['t1', 't2'],
            getLatestLikes: () => cachedLikes,
            updateAccount,
            clearAccount,
        });

        expect(ok).toBe(true);
        const state = useOnlineProviderAccountStore.getState().accounts.qishui;
        expect(state.status).toBe('authenticated');
        expect(state.user?.id).toBe('qs-1001');
        expect(state.likedSongIds).toEqual(['t1', 't2']);
        expect(state.freshness).toBe('fresh');
    });

    it('preserves authenticated session if a playlist/likes endpoint fails after login check', async () => {
        const updateAccount = vi.fn((patch) => useOnlineProviderAccountStore.getState().updateAccount('qishui', patch));
        const clearAccount = vi.fn();

        const ok = await recoverQishuiLibraryAccount({
            availability: { configured: true },
            capabilities: { auth: true, userLibrary: true, likes: true } as never,
            cachedUser: userA,
            cachedLikes: ['t1'],
            checkLoginStatus: async () => userA,
            loadSnapshot: async () => null,
            saveSnapshot: async () => 2000,
            clearSnapshot: async () => {},
            loadPlaylistPage: async () => { throw new Error('network-timeout'); },
            loadLikedSongIds: async () => [],
            getLatestLikes: () => ['t1'],
            updateAccount,
            clearAccount,
        });

        expect(ok).toBe(false);
        const state = useOnlineProviderAccountStore.getState().accounts.qishui;
        expect(state.status).toBe('authenticated');
        expect(state.freshness).toBe('error');
        expect(clearAccount).not.toHaveBeenCalled();
    });

    it('distinguishes resolving, authenticated, network-error, auth-required, and anonymous states', () => {
        const resolving = resolveAccountDisplayState({
            status: 'unknown',
            user: null,
            collections: [],
            likedSongIds: [],
            likedSongFileIds: {},
            hydration: 'loading',
            freshness: 'stale',
        });
        expect(resolving.phase).toBe('resolving');
        expect(resolving.buttonLabel).toBe('恢复中');
        expect(resolving.isLoggedIn).toBe(false);

        const cachedWithNetworkError = resolveAccountDisplayState({
            status: 'authenticated',
            user: userA,
            collections: [],
            likedSongIds: [],
            likedSongFileIds: {},
            hydration: 'ready',
            freshness: 'error',
        });
        expect(cachedWithNetworkError.phase).toBe('network-error');
        expect(cachedWithNetworkError.isLoggedIn).toBe(true);
        expect(cachedWithNetworkError.buttonLabel).toBe('管理');

        const authRequired = resolveAccountDisplayState({
            status: 'error',
            user: null,
            collections: [],
            likedSongIds: [],
            likedSongFileIds: {},
            hydration: 'ready',
            freshness: 'error',
            error: 'auth-required',
        });
        expect(authRequired.phase).toBe('auth-required');
        expect(authRequired.buttonLabel).toBe('重新授权');

        const anonymous = resolveAccountDisplayState({
            status: 'anonymous',
            user: null,
            collections: [],
            likedSongIds: [],
            likedSongFileIds: {},
            hydration: 'ready',
            freshness: 'fresh',
        });
        expect(anonymous.phase).toBe('anonymous');
        expect(anonymous.buttonLabel).toBe('登录');
    });

    it('outputs sanitized Qishui recovery diagnostics without leaking secrets', () => {
        const text = formatQishuiRecoveryDiagnosticLines().join('\n');
        expect(text).toContain('qishui auth recovery:');
        expect(text).toContain('recoveryStarted:');
        expect(text).toContain('deviceIdChanged:');
        expect(text).toContain('finalStatus:');
        expect(text).not.toMatch(/accessCode|guardKey|guardCert|ticket=/);
    });
});
