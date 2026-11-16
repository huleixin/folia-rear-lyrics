import { describe, expect, it } from 'vitest';
import { defaultSmartRules, evaluateSmartPlaylist, type SmartCandidate, type SmartRule } from '../../../../src/library/core/model/smartPlaylists';
import type { ListeningSessionRecord } from '../../../../src/types/listeningStatistics';
import type { SongResult } from '../../../../src/types';
import { getPlaybackSongKey } from '../../../../src/utils/appPlaybackGuards';

// test/unit/library/core/smartPlaylists.test.ts
const now = new Date(2026, 10, 17, 12).getTime();
const song = (id: string): SongResult => ({ id, name: id, artists: [{ id: 1, name: 'Artist' }],
    album: { id: 1, name: 'Album' }, durationMs: 180000, sourceRef: { kind: 'online', providerId: 'qq', mediaId: id } });
const session = (s: SongResult, start = now, id = 'session'): ListeningSessionRecord => ({ id,
    song: s, songKey: getPlaybackSongKey(s), startedAt: start, endedAt: start + 60000,
    seconds: 60, completed: false, providerId: 'qq', accountKey: 'user' });
const rule = (id: string) => defaultSmartRules(now).find(rule => rule.id === id)!;
describe('smart playlists use real observations', () => {
    it('never lists an unplayed track as forgotten', () => {
        const a = song('a'), b = song('b');
        expect(evaluateSmartPlaylist([{ song: a }, { song: b }], [session(a, now - 40 * 86400000)], rule('forgotten'), now).map(f => f.song.id)).toEqual(['a']);
    });
    it('counts weekly effective listens separately from all-time history and duplicate callbacks', () => {
        const a = song('a'), old = session(a, now - 40 * 86400000, 'old'), recent = session(a);
        const result = evaluateSmartPlaylist([{ song: a }], [old, recent, recent], rule('week'), now);
        expect(result[0]).toMatchObject({ plays: 1, seconds: 60 });
    });
    it('does not fabricate added time or quality from names', () => {
        const candidates: SmartCandidate[] = [{ song: song('Hi-Res lossless') }, { song: song('real'), addedAt: now }];
        expect(evaluateSmartPlaylist(candidates, [], rule('added'), now).map(f => f.song.id)).toEqual(['real']);
        expect(evaluateSmartPlaylist(candidates, [], rule('quality'), now)).toEqual([]);
        candidates[1].song.catalogAudioSpecs = ['lossless'];
        expect(evaluateSmartPlaylist(candidates, [], rule('quality'), now)).toHaveLength(1);
    });
    it('excludes both qualified and legacy played songs from liked-unheard', () => {
        const a = song('a'), b = song('b'), c = song('c');
        expect(evaluateSmartPlaylist([{ song:a, liked:true }, { song:b, liked:true, legacyLastPlayed:now }, { song:c, liked:true }],
            [session(a)], rule('unheard'), now).map(f => f.song.id)).toEqual(['c']);
    });
    it('night and annual rules use real local timestamps', () => {
        const a = song('a'), b = song('b');
        const sessions = [session(a, new Date(2026, 10, 17, 2).getTime()), session(b, new Date(2025, 10, 17, 12).getTime(), 'b')];
        for (const id of ['night', 'year']) expect(evaluateSmartPlaylist([{ song:a },{ song:b }], sessions, rule(id), now).map(f => f.song.id)).toEqual(['a']);
    });
    it('supports all/any, truthful missing fields, stable sorting and limits', () => {
        const a = song('a'), b = song('b');
        const custom: SmartRule = { id:'custom', name:'Custom', match:'all', sort:'name', limit:1,
            conditions:[{ field:'source', op:'is', value:'qq' },{ field:'folder', op:'contains', value:'Jazz' }] };
        const candidates = [{ song:b, folder:'/Music/Jazz' },{ song:a }];
        expect(evaluateSmartPlaylist(candidates, [], custom, now).map(f => f.song.id)).toEqual(['b']);
        expect(evaluateSmartPlaylist(candidates, [], { ...custom, match:'any' }, now).map(f => f.song.id)).toEqual(['a']);
    });
});

