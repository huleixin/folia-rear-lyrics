// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest';
import {useSleepTimerStore} from '@/stores/useSleepTimerStore';

// test/unit/stores/nativeSleepTimerPreferences.test.ts
vi.mock('@/platform/runtime',()=>({isCapacitorAndroid:()=>true}));
beforeEach(()=>{
    localStorage.clear();
    useSleepTimerStore.setState({sleepTimerEnabled:true,sleepTimerHours:0,sleepTimerMinutes:30,sleepTimerDeadlineMs:900000,sleepTimerRemainingMs:870000});
});
it('editing a zero duration cannot disarm the task owned by Android',()=>{
    useSleepTimerStore.getState().handleSetSleepTimerMinutes(0);
    useSleepTimerStore.getState().handleSetSleepTimerHours(0);
    expect(useSleepTimerStore.getState()).toMatchObject({sleepTimerEnabled:true,sleepTimerDeadlineMs:900000,sleepTimerRemainingMs:870000});
});
it('saving native UI preferences reuses both existing keys without changing task state',()=>{
    useSleepTimerStore.getState().handleSetSleepTimerDurationMinutes(90);
    expect(localStorage.getItem('sleep_timer_hours')).toBe('1');
    expect(localStorage.getItem('sleep_timer_minutes')).toBe('30');
    expect(useSleepTimerStore.getState()).toMatchObject({sleepTimerEnabled:true,sleepTimerDeadlineMs:900000,sleepTimerRemainingMs:870000,sleepTimerHours:1,sleepTimerMinutes:30});
});
