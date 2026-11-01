import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
    tracks: [] as Array<any>, records: new Map<string, any>(), active: 0, peak: 0, calls: 0,
}));
vi.mock('../../../src/platform/runtime', () => ({ isCapacitorAndroid: () => true }));
vi.mock('../../../src/platform/tingyuPlayback', () => ({
    getTingyuPlayback: () => ({
        resourceCandidates: async () => ({ allowed: true, tracks: state.tracks.slice(0,1) }),
        resourcePlatformResult: async () => { state.tracks.shift(); },
    }),
}));
vi.mock('../../../src/services/sharedSongResources', () => ({
    readSharedLyricRecord: async (song: any) => state.records.get(String(song.id)) ?? null,
}));
vi.mock('../../../src/services/onlineMusic/omni', () => ({ omni: {
    getLyrics: async (song: any) => {
        state.calls++; state.active++; state.peak=Math.max(state.peak,state.active);
        await Promise.resolve();
        state.records.set(String(song.id),{confirmedBy:'stage',lyrics:{lines:[{fullText:'word'}]}});
        state.active--; return {lyrics:{lines:[{fullText:'word'}]}};
    },
} }));
import { runPlatformResourcePrecache } from '../../../src/services/platformResourcePrecache';

// test/unit/services/platformResourcePrecache.test.ts
beforeEach(() => { state.tracks=[]; state.records.clear(); state.active=0; state.peak=0; state.calls=0; });
it.each([30,100,396,500])('enriches the full %i-song manifest serially, without fetching audio', async count => {
    state.tracks=Array.from({length:count},(_,i)=>({
        songKey:'online:qq:'+i,providerId:'qq',mediaId:String(i),title:'song',artist:'artist',
        album:'album',artwork:'',durationMs:100000,providerData:{songId:i},
    }));
    await Promise.all([runPlatformResourcePrecache(),runPlatformResourcePrecache()]);
    expect(state.tracks).toHaveLength(0);
    expect(state.calls).toBe(count);
    expect(state.peak).toBe(1);
});
it('preserves user-selected lyrics and confirmed stage versions without refetching', async () => {
    state.tracks=[{songKey:'online:qq:1',providerId:'qq',mediaId:'1',title:'song',artist:'artist',album:'',durationMs:1}];
    state.records.set('1',{confirmedBy:'native',userChoice:true,lyrics:{lines:[{fullText:'manual'}]}});
    await runPlatformResourcePrecache();
    expect(state.calls).toBe(0);
    expect(state.records.get('1').lyrics.lines[0].fullText).toBe('manual');
});
