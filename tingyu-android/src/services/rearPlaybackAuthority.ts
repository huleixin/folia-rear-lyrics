import type {RearStateSnapshot} from './rearStateRelay';
import type {ObsBrowserSourceConfig} from '../types/obsBrowserSource';

// src/services/rearPlaybackAuthority.ts
// Freshness only chooses a clock inside an already validated output lease.
export function rearPlaybackAuthority(snapshot:RearStateSnapshot,config:ObsBrowserSourceConfig|null){
    const owner=snapshot.owner;
    const external=config?.activePlaybackContext==='stage';
    const track=external?undefined:snapshot.track??undefined;
    const key=config?.playbackSongKey??String(config?.song?.id??'');
    if(!owner)return {track,blocked:false,webAllowed:!track?.epoch||key===track.songKey};
    if(external)return {track:undefined,blocked:false,webAllowed:true};
    const validNative=owner.engine==='media3'&&!!track?.epoch&&track.songKey===owner.songKey&&track.outputSessionId===owner.outputSessionId;
    const matching=key===owner.songKey&&!!owner.songKey&&config?.playbackSessionId===owner.outputSessionId&&(owner.engine==='compatible'||config?.playbackEpoch===owner.epoch);
    const clock=snapshot.clock;
    const clockMatches=clock?.playbackSongKey===owner.songKey&&clock?.playbackSessionId===owner.outputSessionId&&(owner.engine==='compatible'?clock?.requestId===owner.requestId:clock?.playbackEpoch===owner.epoch);
    return {track:validNative?track:undefined,blocked:!validNative&&(!matching||!clockMatches),webAllowed:matching&&clockMatches&&(owner.engine==='compatible'||validNative)};
}
