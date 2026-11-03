// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {buildPlayerViewFlags} from '@/components/app/presentation/buildPlayerViewFlags';
import {bindOutputIdentity} from '@/services/playbackOutputIdentity';

// test/unit/playerControlReadiness.test.ts
const base={currentView:'player',disableHomeDynamicBackground:false,hidePlayerProgressBar:false,hidePlayerTranslationSubtitle:false,hidePlayerRightPanelButton:false,isNowPlayingControlDisabled:false,activePlaybackContext:'main' as const,stageActiveEntryKind:null,audioSrc:null,duration:120,songKey:'current'};
const audio=(key='current',epoch='epoch',ready=4)=>{
    const node=document.createElement('audio');
    Object.defineProperty(node,'readyState',{value:ready});Object.defineProperty(node,'networkState',{value:ready===4?1:2});
    bindOutputIdentity(node,()=>({sessionId:'session',songKey:key,epoch}));return node;
};
it('can control the current native output before JS has an audio URL',()=>{
    expect(buildPlayerViewFlags({...base,activeAudio:audio()}).canToggleCurrentPlayback).toBe(true);
});
it('does not enable a previous native track or an unbound lease',()=>{
    expect(buildPlayerViewFlags({...base,activeAudio:audio('old')}).canToggleCurrentPlayback).toBe(false);
    expect(buildPlayerViewFlags({...base,activeAudio:audio('current','')}).canToggleCurrentPlayback).toBe(false);
    const detached=audio();bindOutputIdentity(detached);
    expect(buildPlayerViewFlags({...base,activeAudio:detached}).canToggleCurrentPlayback).toBe(false);
});
it('keeps native restrictions and media failures authoritative',()=>{
    expect(buildPlayerViewFlags({...base,activeAudio:audio(),isNowPlayingControlDisabled:true}).canToggleCurrentPlayback).toBe(false);
    const node=audio();Object.defineProperty(node,'error',{value:{code:3}});
    expect(buildPlayerViewFlags({...base,activeAudio:node}).canToggleCurrentPlayback).toBe(false);
});
it('reports real pending native metadata separately from an available pause action',()=>{
    const value=buildPlayerViewFlags({...base,activeAudio:audio('current','',0)});
    expect(value.playbackPreparing).toBe(true);expect(value.canToggleCurrentPlayback).toBe(false);
    expect(buildPlayerViewFlags(base).playbackPreparing).toBe(false);
});
it('preserves the compatible-source and standalone lyric session rules',()=>{
    expect(buildPlayerViewFlags({...base,audioSrc:'blob:audio'}).canToggleCurrentPlayback).toBe(true);
    expect(buildPlayerViewFlags({...base,activePlaybackContext:'stage',stageActiveEntryKind:'lyrics'}).canToggleCurrentPlayback).toBe(true);
});
