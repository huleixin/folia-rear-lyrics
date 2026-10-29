// src/types/nativeAudio.ts
export type NativeAudioState={id:string;sequence:number;type:string;external?:boolean;position:number;capturedAtMs?:number;duration:number;buffered:number;songKey?:string;uri?:string;
    playing:boolean;paused:boolean;status:number;errorCode?:number;message?:string;spectrum?:number[]};
export type NativeAudioOptions={fade:boolean;analysis:boolean;loop:boolean;interactive?:boolean};
export type NativeQueueTrack={songKey:string;uri:string;title:string;artist:string;album:string;coverUrl:string;duration:number};
export type NativeAudioPort={
    probe():Promise<{supported:boolean;engine:string}>;
    command(value:Record<string,unknown>):Promise<{accepted:boolean}>;
    addListener(name:'state',callback:(state:NativeAudioState)=>void):Promise<{remove():Promise<void>}>;
};
