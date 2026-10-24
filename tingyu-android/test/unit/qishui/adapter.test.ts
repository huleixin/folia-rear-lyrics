import { afterEach, describe, expect, it, vi } from 'vitest';
import { qishuiProvider } from '@/services/onlineMusic/qishui/qishuiProvider';
import { normalizeQishuiSong } from '@/services/onlineMusic/qishui/qishuiNormalize';
import { parseQishuiLyrics } from '@/services/onlineMusic/qishui/qishuiLyrics';
import { track } from './fixtures';

// test/unit/qishui/adapter.test.ts
afterEach(() => vi.unstubAllGlobals());
describe('Qishui on the current Omni contract', () => {
    it('preserves opaque song ids and relative word timings', () => {
        expect(normalizeQishuiSong(track('7676337516358617115')).sourceRef)
            .toMatchObject({ providerId: 'qishui', mediaId: '7676337516358617115' });
        const result = parseQishuiLyrics({ lyric_entity: { type: 'krc', content: '[1000,1000]<0,400,0>你<400,600,0>好' },
            lang_translations: { 'zh-CN': { type: 'krc', content: '[1000,1000]<0,1000,0>Hello' } } });
        expect(result.lyrics?.lines[0]).toMatchObject({ fullText: '你好', translation: 'Hello', startTime: 1, endTime: 2 });
        expect(result.lyrics?.lines[0].words[1]).toMatchObject({ startTime: 1.4, endTime: 2 });
    });
    it('proxies signed Android audio URLs through the existing native Range server', async () => {
        const registerRemoteAudio = vi.fn(async () => ({ url: 'http://127.0.0.1:9000/remote/fixture' }));
        vi.stubGlobal('window', { electron: { qishuiRequest: async () => ({ ok: true,
            data: { url: 'https://v3.douyinvod.com/song', quality: 'high' } }) },
            Capacitor: { Plugins: { FoliaNative: { registerRemoteAudio } } } });
        await expect(qishuiProvider.playback!.getAudioSource(normalizeQishuiSong(track()), 'high'))
            .resolves.toMatchObject({ url: 'http://127.0.0.1:9000/remote/fixture', quality: 'high' });
        expect(registerRemoteAudio).toHaveBeenCalledWith({ url: 'https://v3.douyinvod.com/song' });
    });
    it('keeps failed QR polls transient without pretending login succeeded', async () => {
        vi.stubGlobal('window', { electron: { qishuiRequest: async () => ({ ok: false,
            error: { code: 'network', message: 'Network unavailable' } }) } });
        await expect(qishuiProvider.auth!.checkQr!('fixture')).resolves.toMatchObject({ state: 'error', transient: true });
    });
    it('does not expose unsupported artist or album search', () => {
        expect(qishuiProvider.search!.searchPlaylists).toBeTypeOf('function');
        expect(qishuiProvider.search!.searchArtists).toBeUndefined();
        expect(qishuiProvider.search!.searchAlbums).toBeUndefined();
        expect(qishuiProvider.capabilities.albums).toBe(false);
    });
    it('refuses cross-provider edits and writing into liked or unowned playlists', async () => {
        const request = vi.fn();
        vi.stubGlobal('window', { electron: { qishuiRequest: request } });
        for (const list of [
            { providerId: 'qq', type: 'playlist', id: '1', name: 'other', isOwned: true },
            { providerId: 'qishui', type: 'playlist', id: '1', name: 'liked', isOwned: true, isLiked: true },
        ]) await expect(qishuiProvider.mutations!.updatePlaylistTracks!('add', list, [normalizeQishuiSong(track())]))
            .rejects.toMatchObject({ code: 'unsupported' });
        expect(request).not.toHaveBeenCalled();
    });
});
