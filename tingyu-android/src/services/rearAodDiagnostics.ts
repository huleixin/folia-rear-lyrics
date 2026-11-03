import {getVisualizerLowPowerStats} from '../utils/visualizerFrameChannel';
import type {RearAodCadenceChange} from '../utils/rearAodCadence';

// src/services/rearAodDiagnostics.ts
// Sparse summaries/transitions through the existing bounded native diagnostics. No lyric text or IO per frame.
export function reportRearAodFrames(trigger:'state-change'|'timeline'|'cancelled'|'cadence-down'|'cadence-up',style:string,target:number,updates:number,interval:number,change?:RearAodCadenceChange){
    const stats=getVisualizerLowPowerStats();
    const params=new URLSearchParams({mode:'AOD',style,trigger,target:String(target),updates:String(updates),interval:String(Math.round(interval)),
        requests:String(stats.requests),late:String(stats.late),work:String(Math.round(stats.workMs)),idle:String(stats.cancelled),pending:String(stats.pending),
        callbackHzMilli:String(Math.round(stats.callbackHz*1000)),windowMs:String(Math.round(stats.measuredMs)),budget:String(stats.cadenceFps),
        downs:String(stats.downgrades),ups:String(stats.recoveries),reason:change?.reason??stats.lastReason,from:String(change?.from??0),to:String(change?.to??0)});
    void fetch('/__folia_rear/aod-report?'+params,{cache:'no-store'}).catch(()=>undefined);
}
