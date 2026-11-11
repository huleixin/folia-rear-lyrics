// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { LocalSong, SongResult } from '@/types';
import { nativeReplayGain, nativeTransition } from '@/services/nativeAudioProcessing';
import { useAutomixSettingsStore } from '@/stores/useAutomixSettingsStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { getPlaybackSongKey } from '@/utils/appPlaybackGuards';

// test/unit/services/nativeAudioProcessing.test.ts
vi.mock('@/services/automix/profileService',()=>({getTrackProfile:()=>null}));
vi.mock('@/services/prefetchService',()=>({getPrefetchedData:()=>null}));
const mix=useAutomixSettingsStore.getState(),playback=usePlaybackStore.getState();
afterEach(()=>{useAutomixSettingsStore.setState(mix);usePlaybackStore.setState(playback);});
const song=(id:number):SongResult=>({id,name:String(id),durationMs:200000,artists:[],album:{id:1,name:'A'}});

it('retains gain and clipping rules for online and local tracks',()=>{
    const online={...song(1),replayGain:{trackGain:-6,albumGain:-3}};
    expect(nativeReplayGain(online,'track')).toBeCloseTo(10**(-6/20));
    expect(nativeReplayGain(online,'album')).toBeCloseTo(10**(-3/20));
    expect(nativeReplayGain(online,'off')).toBe(1);
    expect(nativeReplayGain(song(1),'track',{replayGain:-6} as LocalSong)).toBeCloseTo(10**(-6/20));
    expect(nativeReplayGain({...song(1),replayGain:{trackGain:6,trackPeak:1}},'track')).toBe(1);
});

it('sends an anchored timed crossfade using the actual current duration',()=>{
    const from=song(1),to=song(2);
    useAutomixSettingsStore.setState({automixEnabled:true,transitionMode:'crossfade',crossfadeMaxSec:8});
    usePlaybackStore.setState({currentSong:from,duration:180,lyrics:null});
    const plan=nativeTransition(from,to)!;
    expect(plan.fromKey).toBe(getPlaybackSongKey(from));expect(plan.toKey).toBe(getPlaybackSongKey(to));
    expect(plan.fade).toBe(true);expect(plan.overlapMs).toBe(8000);expect(plan.outStartMs).toBe(172000);
});

it('automix without profiles still sends a fade instead of silently hard-cutting',()=>{
    useAutomixSettingsStore.setState({automixEnabled:true,transitionMode:'automix'});
    const plan=nativeTransition(song(1),song(2))!;
    expect(plan.fade).toBe(true);expect(plan.overlapMs).toBeGreaterThan(0);
    useAutomixSettingsStore.setState({automixEnabled:false});expect(nativeTransition(song(1),song(2))).toBeUndefined();
});
