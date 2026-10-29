// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { useNativeQueuedPlayback } from '@/hooks/useNativeQueuedPlayback';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAudioSettingsStore } from '@/stores/useAudioSettingsStore';

// test/unit/hooks/nativeQueuedPlayback.test.ts
const bridge=vi.hoisted(()=>({stage:vi.fn(async(_element:HTMLMediaElement,_tracks:any[])=>{}),resolve:vi.fn(async(s:any)=>({audioUrl:`https://test.example/${s.id}.mp3`})),hook:false}));
vi.mock('@/services/nativeAudioElement',()=>({setNativeAudioQueue:bridge.stage}));
vi.mock('@/services/prefetchService',()=>({getPrefetchedData:()=>null,resolvePrefetchAudioUrl:bridge.resolve,updatePrefetchedAudioUrl:vi.fn()}));
vi.mock('@/services/nativeLocalMusic',()=>({nativeAudioUrlForRef:async(ref:string)=>`http://127.0.0.1/audio/${ref}`}));
vi.mock('@/services/nativePlaybackBridge',()=>({buildNativePlaybackPayload:(s:any)=>({title:s.name,artist:'Artist',album:'Album',coverUrl:'',duration:s.durationMs})}));
vi.mock('@/services/hostExtensionHooks',()=>({hasBeforePlayHook:()=>bridge.hook}));
vi.mock('@/services/shufflePlayback',()=>({shufflePlayback:{active:()=>false,setEnabled:()=>{},setSuspended:()=>{}}}));
it('hands resolved upcoming tracks to native before EOF and adopts a background transition without reopening the stage',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const old=usePlaybackStore.getState(),settings=useAudioSettingsStore.getState(),root=createRoot(document.createElement('div'));
    const queue=[1,2,3,4].map(id=>({id,name:`Song ${id}`,sourceRef:{kind:'online',providerId:'qq',mediaId:id},artists:[],durationMs:200000} as any));
    const audio={current:document.createElement('audio')},play=vi.fn(async()=>{});
    function Probe(){useNativeQueuedPlayback(audio,true,[],play);return null}
    try{
        usePlaybackStore.setState({currentSong:queue[0],playQueue:queue,audioSrc:'https://test.example/1.mp3',activePlaybackContext:'main',isFmMode:false});
        useAudioSettingsStore.setState({loopMode:'off',shuffleEnabled:false});
        await act(async()=>{root.render(h(Probe));});
        expect(bridge.stage.mock.calls.at(-1)![1].map((t:any)=>t.uri)).toEqual(['https://test.example/2.mp3','https://test.example/3.mp3','https://test.example/4.mp3']);
        const key=bridge.stage.mock.calls.at(-1)![1][0].songKey;
        window.dispatchEvent(new CustomEvent('tingyu-native-queue-track',{detail:{songKey:key,uri:'https://test.example/2.mp3',position:17,paused:false}}));
        expect(play).toHaveBeenCalledWith(queue[1],queue,false,{shouldNavigateToPlayer:false,nativeHandoff:{uri:'https://test.example/2.mp3',position:17,playing:true}});
    }finally{await act(()=>root.unmount());usePlaybackStore.setState(old);useAudioSettingsStore.setState(settings)}
});
