import {expect,it} from 'vitest';
import {buildRearAodTimeline} from '@/utils/rearAodTimeline';
import type {Line} from '@/types';
// test/unit/utils/rearAodTimeline.test.ts
const lines:Line[]=[{fullText:'',startTime:2,endTime:4,words:[{text:'',startTime:2,endTime:2.2},{text:'',startTime:3,endTime:4}]},{fullText:'',startTime:20,endTime:21,words:[]}];
it('uses word interpolation only while singing, with bounded entry/exit transitions',()=>{
 const plan=buildRearAodTimeline(lines);
 expect(plan(0,1,true)).toEqual({fps:0,delay:2000});
 expect(plan(2.1,1,true).fps).toBe(12);expect(plan(3.1,1,true).fps).toBe(10);
 expect(plan(2.8,1,true).fps).toBe(0);expect(plan(4.1,1,true).fps).toBe(12);
 expect(plan(5,1,true)).toEqual({fps:0,delay:15000});expect(plan(22,1,true)).toEqual({fps:0,delay:null});
});
it('pause stops; speed adjusts boundary; seek directly selects current timeline region',()=>{
 const plan=buildRearAodTimeline(lines);
 expect(plan(3,1,false)).toEqual({fps:0,delay:null});expect(plan(5,2,true).delay).toBe(7500);
 expect(plan(20.1,1,true).fps).toBe(12);expect(plan(10,1,true).fps).toBe(0);
 expect(buildRearAodTimeline([])(0,1,true).delay).toBeNull();
});
it('overlapping harmony and quick words produce a finite upper bound',()=>{
 const plan=buildRearAodTimeline(Array.from({length:50},(_,i)=>({fullText:'',startTime:i*.02,endTime:2,words:[{text:'',startTime:i*.02,endTime:2}]})));
 expect(plan(.8,1,true).fps).toBe(12);expect(plan(.8,1,true).delay).toBeGreaterThan(0);expect(plan(3,1,true).delay).toBeNull();
});

it('fifty successive lyric generations never retain the previous song schedule',()=>{for(let i=0;i<50;i++){const plan=buildRearAodTimeline([{fullText:'',startTime:i*10,endTime:i*10+2,words:[]}]);expect(plan(i*10+.1,1,true).fps).toBe(12);expect(plan(i*10+5,1,true).delay).toBeNull();}});
