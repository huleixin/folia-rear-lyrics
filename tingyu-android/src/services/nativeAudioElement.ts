import { notePlaybackTest,playbackTestUriInfo } from './playbackTestLog';
import type { NativeAudioOptions, NativeAudioPort, NativeAudioState } from '../types/nativeAudio';

// src/services/nativeAudioElement.ts
// Preserve the existing DOM media-event contract while Media3 owns fetching/decoding/output.
let blocked=false;
/** Latches out stale queued commands while the transport changes hands; only an explicit switch calls this. */
export function setNativeAudioCommandsBlocked(value:boolean){blocked=value;}
const elements=new WeakMap<HTMLMediaElement,{spectrum:Uint8Array}>();
export const isNativeAudioElement=(element:HTMLMediaElement|null)=>!!element&&elements.has(element);
export const nativeAudioSpectrum=(element:HTMLMediaElement|null)=>element?elements.get(element)?.spectrum:null;
const abort=()=>new DOMException('Playback intent replaced','AbortError');
export function attachNativeAudioElement(element:HTMLAudioElement,port:NativeAudioPort){
    const original=new Map<string,PropertyDescriptor|undefined>();
    const originalAttribute=element.getAttribute.bind(element);
    const bands={spectrum:new Uint8Array(1024)};elements.set(element,bands);
    let source='',track='',id='',sequence=0,lastIntent=0,position=0,duration=0,buffered=0,anchor=performance.now();
    let paused=true,playing=false,ended=false,ready=0,volume=element.volume,muted=element.muted,disposed=false,metadata=false;
    let error:MediaError|null=null,options:NativeAudioOptions={fade:true,analysis:false,loop:false};
    let pending:{resolve:()=>void;reject:(error:unknown)=>void;timer:ReturnType<typeof setTimeout>}|null=null;
    const event=(name:string)=>{if(!disposed)element.dispatchEvent(new Event(name));};
    const time=()=>Math.max(0,Math.min(duration||Infinity,position+(playing&&!paused?(performance.now()-anchor)/1000:0)));
    const rejectPending=(reason:unknown)=>{if(pending){clearTimeout(pending.timer);pending.reject(reason);pending=null;}};
    const onState=(value:NativeAudioState)=>{
        if(blocked||disposed||value.id!==id)return;
        if(value.type!=='clock'&&!value.spectrum)notePlaybackTest('native-state',{type:value.type,status:value.status,playing:value.playing,paused:value.paused,position:value.position,error:value.message??''});
        if(value.spectrum){bands.spectrum.set(value.spectrum.length<=1024?value.spectrum:value.spectrum.slice(0,1024));return;}
        const wasPlaying=playing;
        position=value.position;duration=value.duration;buffered=value.buffered;anchor=performance.now();playing=value.playing;
        if(value.errorCode){
            const firstError=!error;
            error={code:value.errorCode>=2000&&value.errorCode<3000?2:3,message:`原生播放失败：${value.message??value.errorCode}`} as MediaError;
            paused=true;playing=false;ready=0;rejectPending(Error(error.message));if(firstError)event('error');return;
        }
        if(value.status===3){ready=4;if(!metadata){metadata=true;event('loadedmetadata');event('loadeddata');event('canplay');}}
        if(value.type==='seeked'){event('seeked');event('timeupdate');}
        if(value.status===4){const finished=!ended;ended=true;paused=true;playing=false;if(finished)event('ended');return;}
        if(value.sequence>=lastIntent||value.external){
            const previous=paused;paused=value.paused;
            if(previous&&!paused)event('play');else if(!previous&&paused)event('pause');
        }
        if(playing&&!paused){const started=!wasPlaying||!!pending;if(pending){clearTimeout(pending.timer);pending.resolve();pending=null;}if(started)event('playing');}
        else if(!paused&&value.status===2)event('waiting');
        if(value.type==='clock')event('timeupdate');
    };
    let listener:{remove():Promise<void>}|undefined;
    let work=port.addListener('state',onState).then(value=>{listener=value;if(disposed)void value.remove();});
    const send=(action:string,data:Record<string,unknown>={})=>{
        const token=id,revision=++sequence;const started=performance.now();
        if(action!=='volume')notePlaybackTest('native-command',{action,sequence:revision,...(action==='prepare'?playbackTestUriInfo(String(data.uri??'')):{})});
        work=work.catch(()=>{}).then(async()=>{if(blocked)throw abort();const result=await port.command({action,id:token,sequence:revision,...data});if(action!=='volume')notePlaybackTest('native-command-result',{action,accepted:result.accepted,elapsedMs:Math.round(performance.now()-started)});if(!result.accepted)throw abort();});
        void work.catch(error=>notePlaybackTest('native-command-failed',{action,error,elapsedMs:Math.round(performance.now()-started)}));
        return work;
    };
    const set=(name:string,descriptor:PropertyDescriptor)=>{original.set(name,Object.getOwnPropertyDescriptor(element,name));Object.defineProperty(element,name,{configurable:true,...descriptor});};
    set('getAttribute',{value:(name:string)=>name.toLowerCase()==='src'?(source||null):originalAttribute(name)});
    set('src',{get:()=>source,set:(value:string)=>element.setAttribute('src',value)});set('currentSrc',{get:()=>source});set('duration',{get:()=>duration});set('paused',{get:()=>paused});
    set('ended',{get:()=>ended});set('error',{get:()=>error});set('readyState',{get:()=>ready});set('networkState',{get:()=>ready===4?1:2});
    set('buffered',{get:()=>({length:buffered>0?1:0,start:()=>0,end:()=>buffered})});
    set('currentTime',{get:time,set:(value:number)=>{position=Math.max(0,value);anchor=performance.now();ended=false;event('seeking');void send('seek',{position:position*1000}).catch(()=>{});}});
    const updateVolume=()=>{if(id)void send('volume',{volume:muted?0:volume}).catch(()=>{});};
    set('volume',{get:()=>volume,set:(value:number)=>{const next=Math.max(0,Math.min(1,value));if(next===volume)return;volume=next;if(!muted)updateVolume();}});
    set('muted',{get:()=>muted,set:(value:boolean)=>{if(muted===value)return;muted=value;updateVolume();}});
    set('load',{value:()=>{}}); // setSource commits once; the audio bridge must not prepare it twice.
    set('pause',{value:()=>{
        const wasPaused=paused;position=time();anchor=performance.now();paused=true;playing=false;rejectPending(abort());
        lastIntent=sequence+1;if(id)void send('pause').catch(()=>{});if(!wasPaused)event('pause');
    }});
    set('play',{value:()=>{
        if(!source)return Promise.reject(new DOMException('No playback source','NotSupportedError'));
        if(playing&&!paused)return Promise.resolve();
        rejectPending(abort());error=null;paused=false;ended=false;lastIntent=sequence+1;event('play');
        const playId=id,playIntent=lastIntent;
        const failPlay=(reason:unknown)=>{
            if(id!==playId||lastIntent!==playIntent)return;
            position=time();anchor=performance.now();paused=true;playing=false;
            rejectPending(reason);lastIntent=sequence+1;void send('pause').catch(()=>{});event('pause');
        };
        const result=new Promise<void>((resolve,reject)=>{pending={resolve,reject,timer:setTimeout(()=>{notePlaybackTest('native-play-timeout');failPlay(Error('原生播放器等待音频超时'))},15000)};});
        void send('play').catch(failPlay);return result;
    }});
    return {
        setSource(uri:string,key:string){
            if(uri===source&&key===track)return;
            if(!uri&&id)void send('detach').catch(()=>{});
            rejectPending(abort());source=uri;track=key;id=crypto.randomUUID();sequence=0;lastIntent=0;
            position=0;duration=0;buffered=0;anchor=performance.now();paused=true;playing=false;ended=false;error=null;ready=1;metadata=false;bands.spectrum.fill(0);
            event('loadstart');if(!uri)return;
            const preparing=id;
            void send('prepare',{uri,volume:muted?0:volume,...options}).catch(reason=>{
                if(disposed||preparing!==id)return;error={code:4,message:String(reason)} as MediaError;rejectPending(reason);event('error');
            });
        },
        configure(next:NativeAudioOptions){options=next;if(id)void send('configure',next).catch(()=>{});},
        snapshot:()=>({position:time(),paused,source,track,volume,muted}),
        dispose(){
            if(disposed)return Promise.resolve();disposed=true;rejectPending(abort());elements.delete(element);
            for(const [name,descriptor] of original){if(descriptor)Object.defineProperty(element,name,descriptor);else delete (element as unknown as Record<string,unknown>)[name];}
            element.volume=volume;element.muted=muted;
            const stop=id?send('detach'):Promise.resolve();
            return stop.finally(()=>listener?.remove().catch(()=>{}));
        },
    };
}
