import { expect, it, vi } from 'vitest';
import { applySegmentResults, segmentLyricsOffThread } from '@/services/lyricSegmentationWorker';
import type { LyricData } from '@/types';

// test/unit/services/lyricSegmentationWorker.test.ts
it('rejects a late result after a song change and preserves newer translations/timing', () => {
    const current = { lines: [{ fullText: '新的歌词', startTime: 9, translation: 'new translation' }] } as unknown as LyricData;
    expect(applySegmentResults(current, ['旧的歌词'], [['旧的', '歌词']])).toBe(current);
    expect(applySegmentResults(current, ['新的歌词'], [['新的', '歌词']])?.lines[0]).toEqual({ ...current.lines[0], autoWordSegments: ['新的', '歌词'] });
});
it('rejects invalid text boundaries and avoids a second layout for identical results', () => {
    const current = { lines: [{ fullText: '完整歌词', autoWordSegments: ['完整', '歌词'] }] } as LyricData;
    expect(applySegmentResults(current, ['完整歌词'], [['错字']])).toBe(current);
    expect(applySegmentResults(current, ['完整歌词'], [['完整', '歌词']])).toBe(current);
});
it('coalesces segmentation requests and reuses words without blocking main-thread engines', async () => {
    let instance: any;
    class FakeWorker {
        onmessage: any; onerror: any; terminate = vi.fn();
        postMessage = vi.fn(({id,texts}) => queueMicrotask(() => this.onmessage({data:{id,segments:texts.map((t:string)=>[t])}})));
        constructor(){ instance=this; }
    }
    vi.stubGlobal('Worker', FakeWorker);
    try {
        const first=segmentLyricsOffThread(['后台计算']);
        expect(segmentLyricsOffThread(['后台计算'])).toBe(first);
        expect(await first).toEqual([['后台计算']]);
        await segmentLyricsOffThread(['后台计算']);
        expect(instance.postMessage).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
});
