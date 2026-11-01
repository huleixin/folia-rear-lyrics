// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionRestoreController } from '@/hooks/useSessionRestoreController';
import { usePlaybackSessionPersistence } from '@/hooks/usePlaybackSessionPersistence';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAudioSettingsStore } from '@/stores/useAudioSettingsStore';
import { currentTime } from '@/stores/motionSignals';
import { shufflePlayback } from '@/services/shufflePlayback';
import { createQueueSnapshot,finishRecovery } from '@/services/playbackRecoverySnapshot';
import { consumeRecoveryPosition,consumeRecoveryPresentation } from '@/services/androidSessionRecovery';
import { getPlaybackSongKey as key } from '@/utils/appPlaybackGuards';
import { PlayerState, type SongResult } from '@/types';

// test/unit/hooks/playbackSessionRecovery.test.ts
const mocks=vi.hoisted(()=>({read:vi.fn(),save:vi.fn(),checkpoint:vi.fn(),remember:vi.fn(),resolve:vi.fn(),adopt:vi.fn(),legacy:vi.fn(),shared:vi.fn()}));
vi.mock('@/platform/runtime',()=>({isCapacitorAndroid:()=>true}));
vi.mock('@/platform/tingyuPlayback',()=>({getTingyuPlayback:()=>({readPlaybackRecovery:mocks.read,savePlaybackRecovery:mocks.save,checkpointPlaybackRecovery:mocks.checkpoint})}));
vi.mock('@/components/app/playback/restorePlaybackSource',()=>({rememberPlaybackSourceForSong:mocks.remember,restorePlaybackSourceForSong:mocks.resolve}));
vi.mock('@/services/nativeAudioElement',()=>({markNativeQueueAdoption:mocks.adopt}));
vi.mock('@/services/db',()=>({getFromCache:mocks.legacy,getLocalSongs:async()=>[]}));
vi.mock('@/services/sharedSongResources',()=>({readSharedLyrics:mocks.shared}));
vi.mock('@/services/prefetchService',()=>({prefetchNearbySongs:vi.fn()}));
vi.mock('@/services/playbackAdapters',()=>({buildLocalQueue:vi.fn()}));
vi.mock('@/services/onlineMusic/omni',()=>({omni:{canPlaySong:vi.fn()}}));
vi.mock('@/services/localLibraryEntityRepository',()=>({getLocalLibraryCatalogSnapshot:vi.fn()}));
const song=(id:number):SongResult=>({id,name:'T'+id,artists:[],album:{id:8,name:'Album'},durationMs:300000,sourceRef:{kind:'online',providerId:'qq',mediaId:String(id)}});
const tracks=Array.from({length:100},(_,i)=>song(i));
const root=()=>createRoot(document.createElement('div'));
const params=()=>({userId:undefined,pendingResumeTimeRef:{current:null as number|null},blobUrlRef:{current:null},currentOnlineAudioUrlFetchedAtRef:{current:null},setLyrics:vi.fn(),
    restoreCachedThemeForSong:vi.fn(async()=> 'none' as const),persistLastPlaybackCache:vi.fn(async()=>{}),clearPersistedStagePlaybackCache:vi.fn(async()=>{}),loadLocalSongs:vi.fn(async()=>{}),loadLocalPlaylists:vi.fn(async()=>{}),
    shouldAutoPlayRef:{current:true},currentSongRef:{current:null as string|number|null},playbackGenerationRef:{current:0}});
beforeEach(()=>{
    (globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    vi.clearAllMocks();usePlaybackStore.setState({currentSong:null,playQueue:[],audioSrc:null,playerState:PlayerState.IDLE,activePlaybackContext:'main'});
    shufflePlayback.setEnabled(false);shufflePlayback.setSuspended(false);useAudioSettingsStore.setState({autoPlayOnLaunch:true,loopMode:'off',shuffleEnabled:false});
    mocks.save.mockResolvedValue({revision:2});mocks.shared.mockResolvedValue(null);mocks.checkpoint.mockResolvedValue(undefined);currentTime.set(0);
});
afterEach(()=>vi.useRealTimers());
it('cold boot restores paused at song38, never resolves/starts audio, and keeps exact shuffle history through store commit',async()=>{
    const order=[...tracks].reverse().map(key),snapshot=createQueueSnapshot(tracks[37],tracks,'shuffle',order,123456);
    mocks.read.mockResolvedValue({status:'restored',revision:1,snapshot});const p=params(),r=root();
    const Probe=()=>{useSessionRestoreController(p);return null;};
    try{
        await act(async()=>{r.render(h(Probe));});
        const state=usePlaybackStore.getState();expect(state.playQueue).toHaveLength(100);expect(key(state.currentSong!)).toBe(key(tracks[37]));
        expect(state.playerState).toBe(PlayerState.PAUSED);expect(state.audioSrc).toBeNull();expect(p.shouldAutoPlayRef.current).toBe(false);
        expect(currentTime.get()).toBeCloseTo(123.456);expect(mocks.resolve).not.toHaveBeenCalled();expect(mocks.remember).toHaveBeenCalledOnce();expect(mocks.adopt).not.toHaveBeenCalled();
        expect(key(shufflePlayback.previous(state.playQueue,state.currentSong!)!)).toBe(key(tracks[38]));expect(key(shufflePlayback.next(state.playQueue,state.currentSong!)!)).toBe(key(tracks[36]));
        expect(consumeRecoveryPosition(key(tracks[37]))).toBe(123456);expect(p.pendingResumeTimeRef.current).toBeNull();expect(consumeRecoveryPresentation(key(tracks[37]))).toBe(true);
    }finally{await act(async()=>r.unmount());}
});
it('Activity reconstruction adopts a live native session instead of resolving or using disk position',async()=>{
    const snapshot=createQueueSnapshot(tracks[0],tracks,'off',[],0);
    mocks.read.mockResolvedValue({status:'restored',revision:1,snapshot,live:{songKey:key(tracks[37]),uri:'https://live.test/current',position:212.25,duration:300,paused:false},liveMode:'one'});
    const p=params(),r=root();const Probe=()=>{useSessionRestoreController(p);return null;};
    try{
        await act(async()=>r.render(h(Probe)));
        const state=usePlaybackStore.getState();expect(state.audioSrc).toBe('https://live.test/current');expect(state.playerState).toBe(PlayerState.PLAYING);
        expect(currentTime.get()).toBe(212.25);expect(p.pendingResumeTimeRef.current).toBeNull();expect(mocks.adopt).toHaveBeenCalledWith(key(tracks[37]));
        expect(mocks.resolve).not.toHaveBeenCalled();expect(mocks.remember).not.toHaveBeenCalled();expect(useAudioSettingsStore.getState().loopMode).toBe('one');
    }finally{await act(async()=>r.unmount());}
});
it('a stopped or clear snapshot does not fall back to old JS cache or resolve an audio URL',async()=>{
    const p=params(),r=root();mocks.read.mockResolvedValue({status:'stopped',revision:5});const Probe=()=>{useSessionRestoreController(p);return null;};
    try{await act(async()=>r.render(h(Probe)));expect(usePlaybackStore.getState().currentSong).toBeNull();expect(mocks.legacy).not.toHaveBeenCalled();expect(mocks.resolve).not.toHaveBeenCalled();}
    finally{await act(async()=>r.unmount());}
});
it('writes small 20second checkpoints without serializing the entire unchanged queue on every clock event',async()=>{
    vi.useFakeTimers();const r=root(),audio={current:document.createElement('audio')};finishRecovery({status:'empty',revision:0});
    document.body.append(audio.current);
    const Probe=()=>{usePlaybackSessionPersistence(audio);return null;};
    try{
        await act(async()=>r.render(h(Probe)));expect(mocks.save).not.toHaveBeenCalled();
        await act(async()=>usePlaybackStore.setState({currentSong:tracks[37],playQueue:tracks}));expect(mocks.save).toHaveBeenCalledOnce();
        for(let i=1;i<=19;i++)currentTime.set(i);
        await act(async()=>vi.advanceTimersByTimeAsync(19000));expect(mocks.checkpoint).not.toHaveBeenCalled();
        currentTime.set(20);await act(async()=>vi.advanceTimersByTimeAsync(1000));expect(mocks.checkpoint).toHaveBeenCalledOnce();expect(mocks.save).toHaveBeenCalledOnce();
        audio.current.dispatchEvent(new Event('seeked'));await act(async()=>{});expect(mocks.checkpoint).toHaveBeenCalledTimes(2);expect(mocks.save).toHaveBeenCalledOnce();
        await act(async()=>useAudioSettingsStore.setState({shuffleEnabled:true,loopMode:'all'}));const before=mocks.save.mock.calls.length;
        await act(async()=>useAudioSettingsStore.setState({loopMode:'off'}));expect(mocks.save).toHaveBeenCalledTimes(before+1);
        await act(async()=>usePlaybackStore.setState({playQueue:[]}));expect(mocks.save.mock.calls.at(-1)![0].snapshot.cleared).toBe(true);audio.current.remove();
    }finally{await act(async()=>r.unmount());}
});

it('a delayed cold snapshot never overwrites a song the user already selected during launch',async()=>{
    let resolve!:(value:unknown)=>void;mocks.read.mockReturnValue(new Promise(done=>{resolve=done;}));const p=params(),r=root();
    const Probe=()=>{useSessionRestoreController(p);return null;};
    try{
        await act(async()=>r.render(h(Probe)));
        usePlaybackStore.setState({currentSong:tracks[8],playQueue:tracks,audioSrc:'https://user.test/8'});
        await act(async()=>resolve({status:'restored',revision:1,snapshot:createQueueSnapshot(tracks[37],tracks,'all',[],123456)}));
        expect(key(usePlaybackStore.getState().currentSong!)).toBe(key(tracks[8]));expect(usePlaybackStore.getState().audioSrc).toBe('https://user.test/8');
        expect(mocks.remember).not.toHaveBeenCalled();expect(mocks.adopt).not.toHaveBeenCalled();
    }finally{await act(async()=>r.unmount());}
});
