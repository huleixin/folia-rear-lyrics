import { expect,it } from 'vitest';
import { capturePlaybackRequest } from '@/utils/playbackRequestGuard';

// test/unit/services/playbackRequestGuard.test.ts
it('rejects provider changes and A -> B -> A, while allowing metadata updates in the same request',()=>{
    let live={songKey:'online:qq:1',generation:4,request:2,sourceRevision:3};
    const current=capturePlaybackRequest(live.songKey,()=>live);
    expect(current()).toBe(true);
    live={...live,songKey:'online:netease:1'};expect(current()).toBe(false);
    live={...live,songKey:'online:qq:1',generation:6};expect(current()).toBe(false);
});
it('a newer edit or local playback invalidates the old parse/cache completion',()=>{
    const live={songKey:'local:1',generation:4,request:2,sourceRevision:3};
    const current=capturePlaybackRequest(live.songKey,()=>live);
    live.request++;expect(current()).toBe(false);
    const next=capturePlaybackRequest(live.songKey,()=>live);
    live.sourceRevision++;expect(next()).toBe(false);
});
