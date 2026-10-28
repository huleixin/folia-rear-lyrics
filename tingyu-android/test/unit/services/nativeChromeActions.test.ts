import { expect, it, vi } from 'vitest';
import { dispatchChromeAction } from '@/services/nativeChromeActions';

// test/unit/services/nativeChromeActions.test.ts
it('never passes bridge numbers into DOM-compatible playback button handlers', () => {
    const button=vi.fn((event?: { stopPropagation(): void }) => event?.stopPropagation());
    for(const action of ['toggle','loop','next','previous','queue','openStage','quality']) {
        expect(()=>dispatchChromeAction({[action]:button},action,0)).not.toThrow();
    }
    expect(button.mock.calls).toEqual(Array.from({length:7},()=>[]));
});
it('preserves numeric seek and navigation values and rejects invalid numbers', () => {
    const seek=vi.fn(),navigate=vi.fn();
    dispatchChromeAction({seek},'seek',72.5);dispatchChromeAction({navigate},'navigate',1);
    dispatchChromeAction({seek},'seek',NaN);
    expect(seek.mock.calls).toEqual([[72.5],[0]]);expect(navigate).toHaveBeenCalledWith(1);
});
