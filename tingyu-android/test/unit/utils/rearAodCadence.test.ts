import {expect,it} from 'vitest';
import {createRearAodCadence} from '@/utils/rearAodCadence';

// test/unit/utils/rearAodCadence.test.ts
// Synthetic timer/work measurements, not phone DOZE or power measurements.
it('isolated late callbacks never degrade; sustained lateness steps 30 -> 20 -> 12 -> 6 only',()=>{
    const p=createRearAodCadence();let time=0;
    for(let i=0;i<10;i++){p.sample(time+=33,1000,1,true);p.sample(time+=33,0,1,true);}
    expect(p.snapshot().cadenceFps).toBe(30);
    const changes=[];for(let i=0;i<12;i++){const change=p.sample(time+=1000,1000,1,true);if(change)changes.push(change);}
    expect(changes.map(c=>[c.from,c.to])).toEqual([[30,20],[20,12],[12,6]]);
    expect(changes.every(c=>c.reason==='timer-late')).toBe(true);
    expect(p.snapshot().adaptiveFloor).toBeCloseTo(1000/6);expect(p.snapshot().downgrades).toBe(3);
});
it('callback work can reduce the budget, then healthy existing dynamic frames recover without new wakeups',()=>{
    const p=createRearAodCadence();let time=0;
    for(let i=0;i<9;i++)p.sample(time+=100,0,200,true);
    expect(p.snapshot().cadenceFps).toBe(6);expect(p.snapshot().lastReason).toBe('callback-work');
    const changes=[];
    for(let i=0;i<150;i++){const change=p.sample(time+=1000/p.snapshot().cadenceFps,0,1,true);if(change)changes.push(change);}
    expect(changes.map(c=>c.to)).toEqual([12,20,30]);expect(p.snapshot().recoveries).toBe(3);
});
it('idle/state wakeups neither downgrade nor accumulate healthy recovery time; reset starts a new budget',()=>{
    const p=createRearAodCadence();for(let i=0;i<3;i++)p.sample(i*100,1000,1,true);
    expect(p.snapshot().cadenceFps).toBe(20);
    for(let i=0;i<100;i++)p.sample(i*1000,0,1,false);
    p.sample(100001,0,1,true);expect(p.snapshot().cadenceFps).toBe(20);
    p.reset();expect(p.snapshot()).toMatchObject({cadenceFps:30,downgrades:0,recoveries:0,lastReason:'session-reset'});
});
it('does not recover into a budget that observed callback cost cannot sustain',()=>{
    const p=createRearAodCadence();for(let i=0;i<6;i++)p.sample(i*100,1000,1,true);
    for(let i=0;i<200;i++)p.sample(1000+i*84,0,45,true);
    expect(p.snapshot().cadenceFps).toBe(12);
});
