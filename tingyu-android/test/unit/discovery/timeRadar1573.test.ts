import { describe, expect, it, beforeEach } from 'vitest';
import {
    rankDiscovery,
    diagnoseTimeRadar,
    setLatestTimeRadarDiagnostics,
    formatTimeRadarDiagnosticLines,
    type TimeRadarContext,
} from '../../../src/services/discovery/ranking';
import {
    useDiscoveryPreferences,
    recordDiscoveryFeedback,
    clearDiscoveryPreferences,
    hydratePreferences,
    type PreferenceMap,
} from '../../../src/services/discovery/preferences';
import { useDiscoverySettingsStore, type DiscoverySettings } from '../../../src/stores/useDiscoverySettingsStore';
import { resolveSongForNativeSession } from '../../../src/hooks/useDiscoveryListening';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../../src/utils/appPlaybackGuards';
import type { SongResult } from '../../../src/types';
import type { OnlineProviderId } from '../../../src/types/onlineMusic';

function makeOnlineSong(providerId: OnlineProviderId, id: string, artist = `Artist ${id}`): SongResult {
    return {
        id,
        name: `Track ${id}`,
        artists: [{ id: `${providerId}:a:${id}`, name: artist }],
        album: { id: `${providerId}:al:${id}`, name: 'Album' },
        durationMs: 200_000,
        sourceRef: { kind: 'online', providerId, mediaId: id },
    };
}

function makeSettings(overrides: Partial<DiscoverySettings> = {}): DiscoverySettings {
    return {
        ...useDiscoverySettingsStore.getState(),
        source: 'all',
        includeLocal: true,
        record: true,
        enabled: { netease: true, qq: true, kugou: true, bodian: true, qishui: true },
        ...overrides,
    };
}

describe('1.5.73 Time Radar & native session identity fixes', () => {
    beforeEach(() => {
        useDiscoverySettingsStore.setState({ record: true, source: 'all', includeLocal: true });
        useDiscoveryPreferences.setState({ values: {}, revision: 0, ready: true });
        clearDiscoveryPreferences();
    });

    it('recommends up to 30 songs for a new user with >100 platform liked songs and minimal play history', () => {
        const now = 1_794_930_000_000;
        const likedSongs = Array.from({ length: 120 }, (_, i) => makeOnlineSong('qq', `like-${i}`, `Singer ${i}`));
        const likedKeys = new Set(likedSongs.map(s => getPlaybackSongKey(s)));
        const context: TimeRadarContext = {
            likedKeys,
            sessionStats: new Map(),
            preferencesReady: true,
            platformLikedCounts: { qq: 120 },
        };
        const settings = makeSettings();
        const ranked = rankDiscovery(likedSongs, {}, settings, 'time', 'seed', now, 30, context);
        const diag = diagnoseTimeRadar(likedSongs, {}, settings, now, 30, context);

        expect(ranked).toHaveLength(30);
        expect(ranked.every(item => item.reason === '你收藏过且近期未常播的音乐')).toBe(true);
        expect(diag.finalCount).toBe(30);
        expect(diag.tierCounts.s4).toBe(120);
        expect(diag.platformLikedCounts.qq).toBe(120);
    });

    it('prioritizes S1 (>30d) > S2 (>7d) > S3 (>3d frequent) > S4 (liked) > S5 (recent repeated) with accurate reasons', () => {
        const now = 1_794_930_000_000;
        const day = 86400_000;
        const s1 = makeOnlineSong('qq', 's1', 'A1');
        const s2 = makeOnlineSong('netease', 's2', 'A2');
        const s3 = makeOnlineSong('kugou', 's3', 'A3');
        const s4 = makeOnlineSong('qq', 's4', 'A4');
        const s5 = makeOnlineSong('netease', 's5', 'A5');
        const unknownSong = makeOnlineSong('qq', 'stranger', 'Stranger');

        const prefs: PreferenceMap = {
            [getPlaybackSongKey(s1)]: { score: 5, lastPlayed: now - 35 * day, listens: 1, liked: false, blocked: false, day: '2026-10-01', earned: 2, updated: now - 35 * day },
            [getPlaybackSongKey(s2)]: { score: 5, lastPlayed: now - 10 * day, listens: 1, liked: false, blocked: false, day: '2026-11-01', earned: 2, updated: now - 10 * day },
            [getPlaybackSongKey(s3)]: { score: 8, lastPlayed: now - 4 * day, listens: 3, liked: false, blocked: false, day: '2026-11-10', earned: 2, updated: now - 4 * day },
            [getPlaybackSongKey(s5)]: { score: 10, lastPlayed: now - 1 * day, listens: 4, liked: false, blocked: false, day: '2026-11-16', earned: 4, updated: now - 1 * day },
        };
        const context: TimeRadarContext = {
            likedKeys: new Set([getPlaybackSongKey(s4)]),
            sessionStats: new Map(),
            preferencesReady: true,
        };
        const settings = makeSettings();
        const ranked = rankDiscovery([unknownSong, s5, s4, s3, s2, s1], prefs, settings, 'time', 'seed', now, 30, context);

        expect(ranked.map(r => r.song.id)).toEqual(['s1', 's2', 's3', 's4', 's5']);
        expect(ranked[0].reason).toContain('30 天');
        expect(ranked[1].reason).toContain('7 天');
        expect(ranked[2].reason).toContain('3 天');
        expect(ranked[3].reason).toContain('收藏');
        expect(ranked[4].reason).toContain('反复收听');
    });

    it('resolves native Media3 sessions with accurate sourceRef and never defaults unknown sources to netease', () => {
        const qq = resolveSongForNativeSession({
            id: 'sess-qq',
            songKey: 'online:qq:003OUlho2HcRHC',
            providerId: 'qq',
            mediaId: '003OUlho2HcRHC',
            title: '晴天',
            artist: '周杰伦',
            durationMs: 269000,
        });
        expect(qq).not.toBeNull();
        expect(getPlaybackSourceRef(qq!)).toEqual({ kind: 'online', providerId: 'qq', mediaId: '003OUlho2HcRHC' });
        expect(getPlaybackSongKey(qq!)).toBe('online:qq:003OUlho2HcRHC');

        const local = resolveSongForNativeSession({
            id: 'sess-local',
            songKey: 'local:track-42',
            providerId: 'local',
            mediaId: 'track-42',
            title: 'Local Track',
            durationMs: 180000,
        });
        expect(local).not.toBeNull();
        expect(getPlaybackSourceRef(local!)).toEqual({ kind: 'local', mediaId: 'track-42' });

        const unknown = resolveSongForNativeSession({
            id: 'sess-unknown',
            songKey: 'mystery:999',
            providerId: 'online',
            mediaId: '999',
            title: 'Unknown',
        });
        expect(unknown).toBeNull();
    });

    it('queues feedback before preferences hydration and keeps max lastPlayed on out-of-order backfill', async () => {
        const song = makeOnlineSong('qq', 'backfill-1');
        const key = getPlaybackSongKey(song);
        const now = 1_794_930_000_000;

        // Simulate pre-hydration event
        useDiscoveryPreferences.setState({ values: {}, revision: 0, ready: false });
        recordDiscoveryFeedback(song, 'listen', { session: 's-new', seconds: 120, completed: true, now: now - 86400_000 });
        expect(useDiscoveryPreferences.getState().values[key]).toBeUndefined();

        await hydratePreferences();
        expect(useDiscoveryPreferences.getState().ready).toBe(true);
        expect(useDiscoveryPreferences.getState().values[key]?.lastPlayed).toBe(now - 86400_000);

        // Out-of-order older session must not overwrite newer lastPlayed
        recordDiscoveryFeedback(song, 'listen', { session: 's-old', seconds: 120, completed: true, now: now - 20 * 86400_000 });
        expect(useDiscoveryPreferences.getState().values[key]?.lastPlayed).toBe(now - 86400_000);
        expect(useDiscoveryPreferences.getState().values[key]?.listens).toBe(2);
    });

    it('formats sanitized Time Radar diagnostics matching recommendation filtering', () => {
        const now = 1_794_930_000_000;
        const settings = makeSettings({ record: false, source: 'qq' });
        const diag = diagnoseTimeRadar([], {}, settings, now, 30, {
            preferencesReady: true,
            nativeIdentityFailCount: 2,
            platformLikedCounts: {},
        });
        expect(diag.recordingEnabled).toBe(false);
        expect(diag.finalCount).toBe(0);
        expect(diag.emptyReason).toBe('recording-disabled');

        setLatestTimeRadarDiagnostics(diag);
        const lines = formatTimeRadarDiagnosticLines().join('\n');
        expect(lines).toContain('recordingEnabled: false');
        expect(lines).toContain('nativeIdentityFailCount: 2');
        expect(lines).toContain('emptyReason: recording-disabled');
    });
});
