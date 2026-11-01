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

it('native mini-player starts persist the existing custom duration keys atomically without a second task',()=>{
 applySleepState({sample:1,generation:30,active:true,mode:'deadline_track',waiting:false,durationMs:5400000,remainingMs:5399000,reason:'started'});
 expect(useSleepTimerStore.getState()).toMatchObject({sleepTimerEnabled:true,sleepTimerHours:1,sleepTimerMinutes:30,sleepTimerMode:'deadline_track'});
 expect(localStorage.getItem('sleep_timer_hours')).toBe('1');expect(localStorage.getItem('sleep_timer_minutes')).toBe('30');
 applySleepState({sample:2,generation:31,active:true,mode:'track',waiting:true,durationMs:0,remainingMs:0,reason:'started'});
 expect(useSleepTimerStore.getState()).toMatchObject({sleepTimerEnabled:true,sleepTimerWaiting:true,sleepTimerHours:1,sleepTimerMinutes:30});
});
it('a stale native start cannot overwrite newer preferred duration or cancelled state',()=>{
 applySleepState({sample:1,generation:40,active:true,mode:'deadline',waiting:false,durationMs:3600000,remainingMs:3599000,reason:'started'});
 applySleepState({sample:2,generation:41,active:false,mode:'deadline',waiting:false,durationMs:3600000,remainingMs:0,reason:'cancelled'});
 applySleepState({sample:9,generation:39,active:true,mode:'deadline',waiting:false,durationMs:900000,remainingMs:890000,reason:'started'});
 expect(useSleepTimerStore.getState()).toMatchObject({sleepTimerEnabled:false,sleepTimerHours:1,sleepTimerMinutes:0});
});
it('a rejected native change preserves the existing native timer state',async()=>{
 const before=useSleepTimerStore.getState();bridge.startSleepTimer.mockRejectedValueOnce(new Error('missing session'));
 await nativeSleepAction(true,'deadline',900000);
 expect(useSleepTimerStore.getState()).toBe(before);
});

it('entering end-of-track waiting does not overwrite a separately edited duration preference',()=>{
 applySleepState({sample:1,generation:50,active:true,mode:'deadline_track',waiting:false,durationMs:1800000,remainingMs:60000,reason:'started'});
 useSleepTimerStore.getState().handleSetSleepTimerDurationMinutes(120);
 applySleepState({sample:2,generation:51,active:true,mode:'deadline_track',waiting:true,durationMs:1800000,remainingMs:0,reason:'started'});
 expect(useSleepTimerStore.getState()).toMatchObject({sleepTimerEnabled:true,sleepTimerWaiting:true,sleepTimerHours:2,sleepTimerMinutes:0});
});
