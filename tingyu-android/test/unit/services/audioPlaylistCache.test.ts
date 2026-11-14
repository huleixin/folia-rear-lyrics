// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryCollectionDescriptor } from '@/library/core/contracts/collection';
import type { SongResult } from '@/types';

// Interrupted discovery resumes only after the native queue acknowledges the page.
const mock=vi.hoisted(()=>({request:vi.fn(),page:vi.fn(),sync:vi.fn(),open:vi.fn(),message:vi.fn(),route:'a'.repeat(64),android:true,enabled:true,auto:false,network:true,paused:false,offset:0,done:false,failed:false}));
vi.mock('@/platform/runtime',()=>({isCapacitorAndroid:()=>mock.android}));
vi.mock('@/platform/tingyuPlayback',()=>({getTingyuPlayback:()=>({audioOffline:mock.request})}));
vi.mock('@/services/onlineMusic/omni',()=>({omni:{getCollectionTracks:mock.page}}));
vi.mock('@/services/collectionResourcePrecache',()=>({precacheCollectionResources:vi.fn()}));
vi.mock('@/services/lxNativeScriptSync',()=>({syncLxScriptToNative:mock.sync}));
vi.mock('@/services/onlineMusic/resourceKeys',()=>({getAudioCacheRoute:()=>mock.route}));
vi.mock('@/services/nativePlaylistSync',()=>({toNativeResourcePayload:(song:SongResult)=>({songKey:song.id})}));
vi.mock('@/stores/useAudioSettingsStore',()=>({useAudioSettingsStore:{getState:()=>({audioQuality:'standard'})}}));
vi.mock('@/stores/useSettingsModalStore',()=>({useSettingsModalStore:{getState:()=>({openSettings:mock.open})}}));
vi.mock('@/stores/useStatusMessageStore',()=>({setStatusMessage:mock.message}));
const {cacheAudioPlaylist,resumeAudioPlaylistCatalogs}=await import('@/services/audioPlaylistCache');
const descriptor={source:'online',providerId:'qq',type:'playlist',id:'list'} as LibraryCollectionDescriptor;
const songs=[{id:'one'},{id:'two'}] as SongResult[];
const status=()=>({enabled:mock.enabled,autoPlaylist:mock.auto,networkAllowed:mock.network,paused:mock.paused,catalogs:mock.done||mock.failed?[]:[{id:'list',descriptor,quality:'standard',offset:mock.offset,cacheRoute:mock.route}]});
beforeEach(()=>{
    vi.clearAllMocks();Object.assign(mock,{route:'a'.repeat(64),android:true,enabled:true,auto:false,network:true,paused:false,offset:0,done:false,failed:false});
    mock.sync.mockResolvedValue(undefined);
    mock.request.mockImplementation(async(data:any={})=>{if(data.action==='catalog'&&data.tracks){mock.offset=Math.max(mock.offset,data.offset);mock.done=!!data.done;}if(data.failed)mock.failed=true;return status();});
});
describe('whole-playlist audio discovery',()=>{
    it('pages through Omni and commits offsets with the acknowledged songs',async()=>{
        mock.page.mockResolvedValueOnce({items:[songs[0]],hasMore:true,nextOffset:50}).mockResolvedValueOnce({items:[songs[1]],hasMore:false,nextOffset:51});
        await resumeAudioPlaylistCatalogs();
        expect(mock.page.mock.calls.map(call=>call[1])).toEqual([{offset:0,limit:50},{offset:50,limit:50}]);
        expect(mock.request.mock.calls.filter(([d])=>d?.tracks).map(([d])=>[d.offset,d.tracks,d.done])).toEqual([[50,[{songKey:'one'}],false],[51,[{songKey:'two'}],true]]);
        expect(mock.offset).toBe(51);
    });
    it('does not advance the saved offset when native enqueue fails, and resumes that page after manual retry',async()=>{
        mock.offset=50;mock.page.mockResolvedValue({items:[songs[0]],hasMore:false,nextOffset:51});
        mock.request.mockImplementation(async(data:any={})=>{if(data.tracks)throw Error('disk unavailable');if(data.failed)mock.failed=true;return status();});
        await resumeAudioPlaylistCatalogs();expect(mock.offset).toBe(50);expect(mock.failed).toBe(true);
        mock.failed=false;mock.request.mockImplementation(async()=>status());
        await resumeAudioPlaylistCatalogs();expect(mock.page.mock.calls.map(call=>call[1].offset)).toEqual([50,50]);
    });
    it('never queues a page resolved for an obsolete source route',async()=>{
        mock.page.mockImplementation(async()=>{mock.route='b'.repeat(64);return {items:songs,hasMore:false,nextOffset:2};});
        await resumeAudioPlaylistCatalogs();expect(mock.request.mock.calls.some(([d])=>d?.tracks)).toBe(false);
    });
    it('does not discover catalog pages while paused or without an allowed network',async()=>{
        mock.paused=true;await resumeAudioPlaylistCatalogs();mock.paused=false;mock.network=false;await resumeAudioPlaylistCatalogs();expect(mock.page).not.toHaveBeenCalled();
        await cacheAudioPlaylist(descriptor,songs,true);expect(mock.sync).not.toHaveBeenCalled();
    });
    it('manually queues songs without enabling save-while-listening',async()=>{
        mock.enabled=false;mock.network=false;await cacheAudioPlaylist(descriptor,songs);expect(mock.open).not.toHaveBeenCalled();expect(mock.request.mock.calls.some(([d])=>d?.action==='enqueue')).toBe(true);expect(mock.enabled).toBe(false);
    });
    it('registers a durable catalog and known songs without inventing a discovery offset',async()=>{
        mock.network=false;await cacheAudioPlaylist(descriptor,songs);
        const actions=mock.request.mock.calls.filter(([d])=>d?.action).map(([d])=>d);
        expect(mock.sync).toHaveBeenCalledOnce();expect(actions.map(d=>d.action)).toEqual(['catalog','enqueue','resume']);
        expect(actions[0].descriptor).toEqual(descriptor);expect(actions[1].tracks).toEqual([{songKey:'one'},{songKey:'two'}]);expect(actions[1].offset).toBeUndefined();
        await vi.waitFor(()=>expect(mock.request).toHaveBeenCalledTimes(5));expect(mock.page).not.toHaveBeenCalled();
    });
});
