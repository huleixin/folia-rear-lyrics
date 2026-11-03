import type {Line} from '../types';

// src/utils/rearAodTimeline.ts
// Build once per lyric revision. Runtime lookup is logarithmic, with no text or IO.
export const REAR_AOD_MAX_FPS=30;
export function buildRearAodTimeline(lines:readonly Line[],wordTimed=false){
    const events=new Map<number,number>();
    const add=(start:number,end:number)=>{
        if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return;
        events.set(start,(events.get(start)??0)+1);events.set(end,(events.get(end)??0)-1);
    };
    for(const line of lines){
        add(line.startTime,line.startTime+.6);
        add(line.endTime,line.endTime+.4);
        if(!wordTimed)continue; // Line-only parsers also synthesize words; they are not real word timestamps.
        if(line.words?.length){for(const word of line.words)add(word.startTime,word.endTime);}
        for(const vocal of [...(line.backgroundVocals??[]),...(line.backgroundVocal?[line.backgroundVocal]:[])]){
            for(const word of vocal.words??[])add(word.startTime,word.endTime);
        }
        // Without word timestamps only line boundaries change the visible state.
    }
    // Merge overlapping/adjacent demand windows. Internal word boundaries do not add extra frames.
    const points:number[]=[],rates:number[]=[];let weight=0,previous=0;
    for(const point of [...events.keys()].sort((a,b)=>a-b)){
        weight+=events.get(point)!;const rate=weight>0?REAR_AOD_MAX_FPS:0;
        if(rate!==previous){points.push(point);rates.push(rate);previous=rate;}
    }
    return (time:number,speed:number,playing:boolean):{delay:number|null;fps:number}=>{
        if(!playing||!Number.isFinite(time)||!Number.isFinite(speed)||speed<=0)return {delay:null,fps:0};
        let lo=0,hi=points.length;while(lo<hi){const mid=(lo+hi)>>>1;if(points[mid]<=time)lo=mid+1;else hi=mid;}
        const fps=lo?rates[lo-1]:0,next=points[lo];
        const boundary=next===undefined?null:Math.max(1,(next-time)*1000/speed);
        return {fps,delay:fps?Math.min(1000/fps,boundary??Infinity):boundary};
    };
}
