import type { ReplayGainMode } from '../types';

// src/services/playbackPower.ts
// Keep the plain media pipeline until a requested feature really needs Web Audio.
export function needsProcessedPlayback(options: {
    android: boolean; analysis: boolean; equalizer: boolean; automix: boolean;
    replayGain: ReplayGainMode; fade: boolean;
}): boolean {
    return !options.android || options.analysis || options.equalizer || options.automix
        || options.replayGain !== 'off' || options.fade;
}

/** Event-driven: never suspend a sounding deck, including an outgoing automix tail. */
export function bindPlaybackContextIdle(context: AudioContext, elements: readonly HTMLMediaElement[]) {
    let disposed=false, timer:ReturnType<typeof setTimeout>|undefined;
    const audible=()=>elements.some(element=>!element.paused&&!element.ended);
    const resume=()=>{
        clearTimeout(timer);
        if(!disposed&&context.state==='suspended')void context.resume().catch(()=>{});
    };
    const pause=()=>{
        clearTimeout(timer);
        // Allow transport fades and their short output drain to finish first.
        timer=setTimeout(()=>{
            if(disposed||audible()||context.state!=='running')return;
            void context.suspend().then(()=>{
                // Play may arrive while suspend() is in flight on the audio thread.
                if(!disposed&&audible())resume();
            }).catch(()=>{});
        },600);
    };
    for(const element of elements){
        element.addEventListener('play',resume);element.addEventListener('playing',resume);
        element.addEventListener('pause',pause);element.addEventListener('ended',pause);
        element.addEventListener('emptied',pause);
    }
    if(!audible())pause();
    return()=>{
        disposed=true;clearTimeout(timer);
        for(const element of elements){
            element.removeEventListener('play',resume);element.removeEventListener('playing',resume);
            element.removeEventListener('pause',pause);element.removeEventListener('ended',pause);
            element.removeEventListener('emptied',pause);
        }
    };
}
