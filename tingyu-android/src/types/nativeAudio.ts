// src/types/nativeAudio.ts
export type NativeAudioState={id:string;sequence:number;type:string;external?:boolean;position:number;capturedAtMs?:number;duration:number;buffered:number;
    playing:boolean;paused:boolean;status:number;errorCode?:number;message?:string;spectrum?:number[]};
export type NativeAudioOptions={fade:boolean;analysis:boolean;loop:boolean};
export type NativeAudioPort={
    probe():Promise<{supported:boolean;engine:string}>;
    command(value:Record<string,unknown>):Promise<{accepted:boolean}>;
    addListener(name:'state',callback:(state:NativeAudioState)=>void):Promise<{remove():Promise<void>}>;
};
