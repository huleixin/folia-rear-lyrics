// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {applySleepState,nativeSleepAction} from '@/services/nativeSleepTimer';
import {useSleepTimerStore} from '@/stores/useSleepTimerStore';
// test/unit/services/nativeSleepTimer.test.ts
const bridge=vi.hoisted(()=>({startSleepTimer:vi.fn(),cancelSleepTimer:vi.fn()}));
vi.mock('@/platform/tingyuPlayback',()=>({getTingyuPlayback:()=>bridge}));
it('native generation is authoritative and stale replies cannot revive a cancelled timer',()=>{
 applySleepState({generation:5,active:true,mode:'deadline_track',waiting:false,durationMs:900000,remainingMs:850000,reason:'started'});
 expect(useSleepTimerStore.getState().sleepTimerRemainingMs).toBe(850000);
 applySleepState({generation:6,active:false,mode:'deadline_track',waiting:false,durationMs:900000,remainingMs:0,reason:'cancelled'});
 applySleepState({generation:5,active:true,mode:'track',waiting:true,durationMs:0,remainingMs:0,reason:'started'});
 expect(useSleepTimerStore.getState().sleepTimerEnabled).toBe(false);
});
it('commands and mobile UI use one serialized native task',async()=>{
 bridge.startSleepTimer.mockResolvedValue({generation:7,active:true,mode:'deadline',waiting:false,durationMs:1800000,remainingMs:1800000,reason:'started'});
 bridge.cancelSleepTimer.mockResolvedValue({generation:8,active:false,mode:'deadline',waiting:false,durationMs:1800000,remainingMs:0,reason:'cancelled'});
 await Promise.all([nativeSleepAction(true,'deadline',1800000),nativeSleepAction(false)]);
 expect(bridge.startSleepTimer).toHaveBeenCalledOnce();expect(bridge.cancelSleepTimer).toHaveBeenCalledOnce();expect(useSleepTimerStore.getState().sleepTimerEnabled).toBe(false);
});

it('rejects older same-task snapshots so an Activity read cannot increase the countdown',()=>{
 applySleepState({sample:4,generation:20,active:true,mode:'deadline',waiting:false,durationMs:900000,remainingMs:500000,reason:'started'});
 applySleepState({sample:3,generation:20,active:true,mode:'deadline',waiting:false,durationMs:900000,remainingMs:700000,reason:'started'});
 expect(useSleepTimerStore.getState().sleepTimerRemainingMs).toBe(500000);
});
