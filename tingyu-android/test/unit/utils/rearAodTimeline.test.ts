import {expect,it} from 'vitest';
import {buildRearAodTimeline} from '@/utils/rearAodTimeline';
import type {Line} from '@/types';
// test/unit/utils/rearAodTimeline.test.ts
const lines:Line[]=[{fullText:'',startTime:2,endTime:4,words:[{text:'',startTime:2,endTime:2.2},{text:'',startTime:3,endTime:4}]},{fullText:'',startTime:20,endTime:21,words:[]}];
it('uses word interpolation only while singing, with bounded entry/exit transitions',()=>{
 const plan=buildRearAodTimeline(lines,true);
 expect(plan(0,1,true)).toEqual({fps:0,delay:2000});
 expect(plan(2.1,1,true).fps).toBe(30);expect(plan(3.1,1,true).fps).toBe(30);
 expect(plan(2.8,1,true).fps).toBe(0);expect(plan(4.1,1,true).fps).toBe(30);
 expect(plan(5,1,true)).toEqual({fps:0,delay:15000});expect(plan(22,1,true)).toEqual({fps:0,delay:null});
});
it('pause stops; speed adjusts boundary; seek directly selects current timeline region',()=>{
 const plan=buildRearAodTimeline(lines,true);
 expect(plan(3,1,false)).toEqual({fps:0,delay:null});expect(plan(5,2,true).delay).toBe(7500);
 expect(plan(20.1,1,true).fps).toBe(30);expect(plan(10,1,true).fps).toBe(0);
 expect(buildRearAodTimeline([])(0,1,true).delay).toBeNull();
});
it('overlapping harmony and quick words produce a finite upper bound',()=>{
 const plan=buildRearAodTimeline(Array.from({length:50},(_,i)=>({fullText:'',startTime:i*.02,endTime:2,words:[{text:'',startTime:i*.02,endTime:2}]})),true);
 expect(plan(.8,1,true).fps).toBe(30);expect(plan(.8,1,true).delay).toBeGreaterThan(0);expect(plan(3,1,true).delay).toBeNull();
});

it('fifty successive lyric generations never retain the previous song schedule',()=>{for(let i=0;i<50;i++){const plan=buildRearAodTimeline([{fullText:'',startTime:i*10,endTime:i*10+2,words:[]}]);expect(plan(i*10+.1,1,true).fps).toBe(30);expect(plan(i*10+5,1,true).delay).toBeNull();}});
it('line lyrics with synthesized words do not create fake word animation',()=>{
 const plan=buildRearAodTimeline([{fullText:'',startTime:0,endTime:20,words:[{text:'',startTime:0,endTime:20}]}],false);
 expect(plan(.3,1,true).fps).toBe(30);expect(plan(10,1,true)).toEqual({fps:0,delay:10000});
 expect(plan(20.2,1,true).fps).toBe(30);
});
it('adjacent and overlapping timestamps share one 30 FPS budget, including fast playback',()=>{
 const plan=buildRearAodTimeline([{fullText:'',startTime:0,endTime:10,words:Array.from({length:1000},(_,i)=>({text:'',startTime:i*.01,endTime:i*.01+.02})),backgroundVocals:[{text:'',words:[{text:'',startTime:1,endTime:9}],startTime:1,endTime:9}]}],true);
 for(const speed of [.5,1,2,3])for(const time of [1,3.141,5,9.99])expect(plan(time,speed,true)).toEqual({fps:30,delay:1000/30});
 expect(plan(5,2,false).delay).toBeNull();expect(plan(5,0,true).delay).toBeNull();
});
