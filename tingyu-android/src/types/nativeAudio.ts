// src/types/nativeAudio.ts
export type NativeAudioState={decoderOffer?:number;eventRevision?:number;engineSessionId?:string;capturedAtElapsedMs?:number;trackGeneration?:number;playbackRate?:number;endedBySleep?:boolean;id:string;sequence:number;type:string;external?:boolean;position:number;capturedAtMs?:number;duration:number;buffered:number;songKey?:string;uri?:string;
    playing:boolean;paused:boolean;status:number;errorCode?:number;message?:string;spectrum?:number[];compatibilityClaimed?:boolean;
    /** 只读的当前音轨规格快照（Media3 所选音轨的源 Format，不是解码后的 PCM 参数）。 */
    audioSpec?:NativeAudioSpec;shuffleOrder?:string[]};
/**
 * 当前播放音轨的真实规格（Media3 Format）。
 *
 * `bitsPerSample` 只在源 Format 真的携带时出现（FLAC/WAV 等）——解码后的
 * `pcmEncoding` 是 PCM 位深，**永远不能**当成原始文件的位深。
 * `confirmed` 表示这些值来自 Media3 所选音轨的 Format（数据来源与确认状态）。
 */
export type NativeAudioSpec={songKey:string;sourceId:string;mime:string;codecs:string;sampleRate:number;channels:number;bitrate?:number;bitsPerSample?:number;capturedAtMs:number;confirmed:boolean};
export type NativeTransition={fromKey:string;toKey:string;fade:boolean;outStartMs:number;inStartMs:number;overlapMs:number;stretch:number};
export type NativeAudioOptions={fade:boolean;analysis:boolean;loop:boolean;interactive?:boolean;
    equalizer?:{enabled:boolean;gains:number[];effects?:Record<string,number>};replayGain?:number;
    mix?:{enabled:boolean;mode:string;seconds:number}};
export type NativeQueueTrack={songKey:string;uri:string;title:string;artist:string;album:string;coverUrl:string;duration:number;replayGain?:number;transition?:NativeTransition};
/**
 * Window metadata for the native playlist.
 *
 * `anchor` is the track the window was computed for - the engine's own current item, which is
 * not necessarily what the UI thinks is playing. `verdict` is the difference between "the
 * playlist ended", "more music follows" and "this resolver could not tell"; without it the native
 * player had no way to tell the three apart and simply stopped on the first one it saw.
 * `continues` is kept for older native builds and is derived from `verdict`.
 * `generation` lets a late window be recognised as late.
 */
export type NativeQueueWindow={anchor:string;continues:boolean;generation:number;verdict?:'continues'|'finished'|'unknown'};
export type NativeAudioPort={
    probe():Promise<{supported:boolean;engine:string}>;
    command(value:Record<string,unknown>):Promise<{accepted:boolean}>;
    addListener(name:'state',callback:(state:NativeAudioState)=>void):Promise<{remove():Promise<void>}>;
};
