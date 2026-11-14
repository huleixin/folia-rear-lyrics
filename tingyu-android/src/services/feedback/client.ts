import {collectDiagnosticEnvironment, diagnosticEventsJsonl} from '../diagnostics/diagnosticPackage';
import {readCrashDiagnostics,readNativePlaybackFailureTrace} from '../../utils/crashDiagnostics';
import {nativeDiagnosticsPlugin} from '../diagnostics/diagnosticLog';
import {readFrameTimingSnapshot} from '../../utils/frameTimingDiagnostics';
import {scrubText} from './schema.mjs';

// src/services/feedback/client.ts: lazy worker, no upload without an explicit send action.
export type CloudPreview={localId:string;preview:string;bytes:number};
export type CloudFailure={attempts:Array<{time:string;host:string;stage:string;bytes:number;httpStatus:number;elapsedMs:number;code:string;ray?:string;requestId?:string;serverStage?:string;retries?:number}>;elapsedMs:number};
export type CloudHistory={localId:string;at:number;category:string;status:string;feedbackId?:string;lastError?:CloudFailure};
type Update={progress?:number;phase?:string};
type Pending={resolve:(v:any)=>void;reject:(e:Error)=>void;update?:(u:Update)=>void};
let worker:Worker|undefined,sequence=0;
const calls=new Map<number,Pending>();
function getWorker(){if(worker)return worker;worker=new Worker(new URL('./feedback.worker.mjs',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{const p=calls.get(data.id);if(!p)return;if(data.progress!==undefined||data.phase){p.update?.(data);return;}calls.delete(data.id);if(data.error)p.reject(Object.assign(Error(data.error),{report:data.report}));else p.resolve(data.value);};
  worker.onerror=()=>{for(const p of calls.values())p.reject(Error('worker_unavailable'));calls.clear();worker?.terminate();worker=undefined;};return worker;}
export function cloudCall<T>(action:string,input:unknown={},update?:(u:Update)=>void):Promise<T>{return new Promise((resolve,reject)=>{const id=++sequence;calls.set(id,{resolve,reject,update});try{getWorker().postMessage({id,action,input});}catch{calls.delete(id);reject(Error('worker_unavailable'));}});}
export async function prepareCloudFeedback(draft:{category:string;description:string;steps:string;includeDiagnostics:boolean}):Promise<CloudPreview>{
  const env=await collectDiagnosticEnvironment();
  const plugin=nativeDiagnosticsPlugin() as ReturnType<typeof nativeDiagnosticsPlugin>&{cloudDiagnosticSnapshot?:()=>Promise<{events?:string;crashes?:string}>};
  const [crashes,native,trace]=draft.includeDiagnostics?await Promise.all([plugin?.cloudDiagnosticSnapshot?Promise.resolve([]):readCrashDiagnostics().catch(()=>[]),plugin?.cloudDiagnosticSnapshot?.().catch(()=>({events:'',crashes:'[]'})),readNativePlaybackFailureTrace().catch(()=>[])]):[[],null,[]];
  const performance:Record<string,number>={};
  if(draft.includeDiagnostics){try{const s=readFrameTimingSnapshot();performance.frameCount=s.frameCount;performance.jankCount=s.sessionJankCount;}catch{}}
  return cloudCall('prepare',{...draft,description:scrubText(draft.description),steps:scrubText(draft.steps),
    metadata:{version:typeof __APP_VERSION__==='undefined'?'unknown':__APP_VERSION__,versionCode:env.versionCode??0,
      commit:env.buildId?.split('@')[1]?.replace(/-dirty$/,'')??'',buildDirty:env.buildId?.endsWith('-dirty')===true,model:env.model??'',manufacturer:env.manufacturer??'',os:env.release??'',sdk:env.sdk??0,
      webview:env.webview??'',width:screen.width,height:screen.height,pad:Math.min(screen.width,screen.height)>=600},
    frontendEvents:draft.includeDiagnostics?diagnosticEventsJsonl():'',
    events:trace.map(e=>({t:e.at,m:'media3',l:/error|fail|stall|buffer/i.test(e.type)?'error':'info',e:e.type,f:e.data})),
    nativeEvents:native?.events??'',nativeCrashes:native?.crashes??'[]',crashes,performance});
}
