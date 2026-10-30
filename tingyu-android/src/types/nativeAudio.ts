// src/types/nativeAudio.ts
export type NativeAudioState={id:string;sequence:number;type:string;external?:boolean;position:number;capturedAtMs?:number;duration:number;buffered:number;songKey?:string;uri?:string;
    playing:boolean;paused:boolean;status:number;errorCode?:number;message?:string;spectrum?:number[]};
export type NativeAudioOptions={fade:boolean;analysis:boolean;loop:boolean;interactive?:boolean};
export type NativeQueueTrack={songKey:string;uri:string;title:string;artist:string;album:string;coverUrl:string;duration:number};
/**
 * Window metadata for the native playlist.
 *
 * `anchor` is the track the window was computed for - the engine's own current item, which is
 * not necessarily what the UI thinks is playing. `continues` is the difference between "the
 * playlist ended" and "the resolved window ended"; without it the native player had no way to
 * tell the two apart and simply stopped. `generation` lets a late window be recognised as late.
 */
export type NativeQueueWindow={anchor:string;continues:boolean;generation:number};
export type NativeAudioPort={
    probe():Promise<{supported:boolean;engine:string}>;
    command(value:Record<string,unknown>):Promise<{accepted:boolean}>;
    addListener(name:'state',callback:(state:NativeAudioState)=>void):Promise<{remove():Promise<void>}>;
};
