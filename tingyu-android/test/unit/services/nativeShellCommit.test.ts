import { expect, it, vi } from 'vitest';
import { flushNativeShellRoute, scheduleNativeShellRoute, setNativeShellPublisher } from '@/services/nativeShellCommit';

// test/unit/services/nativeShellCommit.test.ts
it('coalesces history restoration and flushes its final route before a page packet', async () => {
    let route='stage'; const sent:string[]=[];
    const publish=vi.fn(()=>sent.push(route));setNativeShellPublisher(publish);
    route='home';scheduleNativeShellRoute();route='collection';scheduleNativeShellRoute();route='home';
    expect(publish).not.toHaveBeenCalled();
    flushNativeShellRoute();sent.push('page:home');
    await Promise.resolve();
    expect(sent).toEqual(['home','page:home']);
});
