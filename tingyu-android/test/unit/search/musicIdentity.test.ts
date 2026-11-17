import { describe, expect, it } from 'vitest';
import type { UnifiedSong } from '@/types';
import { groupMusicSources, sourceSongMap } from '@/services/musicIdentity';

// test/unit/search/musicIdentity.test.ts
const song = (providerId: string, id: number, extra: Partial<UnifiedSong> = {}): UnifiedSong => ({
    id, name: 'Song', artists: [{ id: 1, name: 'Singer' }], album: { id: 1, name: 'Album' }, durationMs: 200000,
    sourceRef: { kind: 'online', providerId, mediaId: String(id) }, ...extra,
} as UnifiedSong);
describe('conservative shared recording groups', () => {
    it('preserves source identity collisions and last-value same-source updates', () => {
        const a=song('netease',1), b=song('qq',1), update={...a,name:'Updated'};
        expect([...sourceSongMap([a,b,update]).values()]).toEqual([update,b]);
    });
    it('groups complete matching metadata while keeping the original carriers', () => {
        const a=song('netease',1), b=song('qq',2,{durationMs:200700});
        expect(groupMusicSources([a,b])).toEqual([{key:'online:netease:1',sources:[a,b],evidence:'metadata'}]);
    });
    it('does not merge different IDs on the same platform by metadata', () => {
        expect(groupMusicSources([song('qq',1),song('qq',2)])).toHaveLength(2);
    });
    it.each([
        {album:{id:0,name:''}}, {album:{id:0,name:'Unknown Album'}}, {artists:[]}, {artists:[{id:0,name:'未知歌手'}]},
        {durationMs:0}, {durationMs:NaN}, {durationMs:201500}, {album:{id:2,name:'Different album'}},
        {artists:[{id:2,name:'Another singer'}]}, {aliases:['Live']}, {name:'Song (Remastered)'},
        {sourceRef:{kind:'stage',mediaId:'2'}},
    ] as Partial<UnifiedSong>[])('keeps insufficient or different recordings independent: %j', extra => {
        expect(groupMusicSources([song('netease',1),song('qq',2,extra)])).toHaveLength(2);
    });
    it('requires all members to be within duration tolerance, preventing chain drift', () => {
        const groups=groupMusicSources([song('netease',1),song('qq',2,{durationMs:200800}),song('bodian',3,{durationMs:201600})]);
        expect(groups.map(g=>g.sources.length)).toEqual([2,1]);
    });
    it('accepts native catalog IDs but ignores lyric matching IDs on other platforms', () => {
        const a=song('qq',1,{qqMid:'native'}), b=song('qq',2,{qqMid:'native',name:'Localized name'});
        expect(groupMusicSources([a,b])[0]).toMatchObject({sources:[a,b],evidence:'catalog'});
        expect(groupMusicSources([song('netease',1,{qqMid:'native',album:{id:0,name:''}}),b])).toHaveLength(2);
    });
    it('does not confuse substring version markers with actual version words', () => {
        expect(groupMusicSources([song('netease',1,{aliases:['Discover']}),song('qq',2)])).toHaveLength(1);
    });
});
