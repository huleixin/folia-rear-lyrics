// src/utils/rearAodCadence.ts
// A graphics-only budget based on observed timer lateness and callback wall time, never display FPS.
export const REAR_AOD_FPS_LEVELS=[30,20,12,6] as const;
export type RearAodCadenceChange={from:number;to:number;reason:'timer-late'|'callback-work'|'recovered'};
export function createRearAodCadence(){
    let level=0,badRuns=0,healthySince:number|null=null,healthyRuns=0;
    let downgrades=0,recoveries=0,lastReason='session-reset';
    const snapshot=()=>({cadenceFps:REAR_AOD_FPS_LEVELS[level],adaptiveFloor:level?1000/REAR_AOD_FPS_LEVELS[level]:0,downgrades,recoveries,lastReason});
    const clearHealth=()=>{healthySince=null;healthyRuns=0;};
    return {
        snapshot,
        reset(){level=0;badRuns=0;clearHealth();downgrades=0;recoveries=0;lastReason='session-reset';},
        // Ignore immediate state events and idle boundary wakeups: neither measures continuous frame capacity.
        sample(now:number,lateness:number,workMs:number,dynamic:boolean):RearAodCadenceChange|null{
            if(!dynamic){badRuns=0;clearHealth();return null;}
            const budget=1000/REAR_AOD_FPS_LEVELS[level];
            const reason=lateness>Math.max(12,budget*.75)?'timer-late':workMs>budget*.85?'callback-work':null;
            if(reason){
                clearHealth();
                badRuns=Math.min(3,badRuns+1);
                if(badRuns<3||level===REAR_AOD_FPS_LEVELS.length-1)return null;
                badRuns=0;const from=REAR_AOD_FPS_LEVELS[level++];downgrades++;lastReason=reason;
                return {from,to:REAR_AOD_FPS_LEVELS[level],reason};
            }
            badRuns=0;
            if(level===0){clearHealth();return null;}
            const nextBudget=1000/REAR_AOD_FPS_LEVELS[level-1];
            if(lateness+workMs>nextBudget*.75){clearHealth();return null;}
            if(healthySince===null)healthySince=now;
            if(++healthyRuns<12||now-healthySince<3000)return null;
            clearHealth();const from=REAR_AOD_FPS_LEVELS[level--];recoveries++;lastReason='recovered';
            return {from,to:REAR_AOD_FPS_LEVELS[level],reason:'recovered'};
        },
    };
}
