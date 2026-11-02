import type {Line} from '../types';

// src/utils/rearAodTimeline.ts
// Build once per lyric revision. Runtime lookup is logarithmic, with no text or IO.
export function buildRearAodTimeline(lines:readonly Line[]){
    const events=new Map<number,number>();
    const add=(start:number,end:number,fps:number)=>{
        if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return;
        events.set(start,(events.get(start)??0)+fps);events.set(end,(events.get(end)??0)-fps);
    };
    for(const line of lines){
        add(line.startTime,line.startTime+.6,12);
        add(line.endTime,line.endTime+.4,12);
        if(line.words?.length){for(const word of line.words)add(word.startTime,word.endTime,10);}
        for(const vocal of [...(line.backgroundVocals??[]),...(line.backgroundVocal?[line.backgroundVocal]:[])]){
            for(const word of vocal.words??[])add(word.startTime,word.endTime,10);
        }
        // Without word timestamps only line boundaries change the visible state.
    }
    const points=[...events.keys()].sort((a,b)=>a-b);let weight=0;
    const rates=points.map(point=>{weight+=events.get(point)!;return weight>10?12:weight>0?10:0;});
    return (time:number,speed:number,playing:boolean):{delay:number|null;fps:number}=>{
        if(!playing||!Number.isFinite(time)||!Number.isFinite(speed)||speed<=0)return {delay:null,fps:0};
        let lo=0,hi=points.length;while(lo<hi){const mid=(lo+hi)>>>1;if(points[mid]<=time)lo=mid+1;else hi=mid;}
        const fps=lo?rates[lo-1]:0,next=points[lo];
        const boundary=next===undefined?null:Math.max(1,(next-time)*1000/speed);
        return {fps,delay:fps?Math.min(1000/fps,boundary??Infinity):boundary};
    };
}
