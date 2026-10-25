// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { installFrameTimingDiagnostics, resetFrameTimingDiagnostics, readFrameTimingSnapshot, isFrameTimingSamplingEnabled } from '@/utils/frameTimingDiagnostics';
import { sampleFrameTimingWindow } from '@/utils/frameTimingDemand';

// test/unit/utils/frameTimingDemand.test.ts
// Mobile diagnostics must not become a high-refresh animation on an otherwise idle library.
afterEach(()=>{resetFrameTimingDiagnostics();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
function browser() {
    vi.useFakeTimers();vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
    const request=vi.fn((cb:FrameRequestCallback)=>window.setTimeout(()=>cb(Date.now()),16));
    vi.stubGlobal('requestAnimationFrame',request);vi.stubGlobal('cancelAnimationFrame',clearTimeout);
    return request;
}
it('keeps passive startup and visibility/scroll changes free of RAF requests',()=>{
    const request=browser();installFrameTimingDiagnostics(false);vi.advanceTimersByTime(60000);
    document.dispatchEvent(new Event('scroll'));document.dispatchEvent(new Event('touchmove'));document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60000);expect(request).not.toHaveBeenCalled();expect(readFrameTimingSnapshot().installed).toBe(true);
    expect(readFrameTimingSnapshot().frameCount).toBe(0);expect(vi.getTimerCount()).toBe(0);
});
it('coalesces report windows, collects real frame samples, then stops even after visibility returns',async()=>{
    browser();installFrameTimingDiagnostics(false);
    const first=sampleFrameTimingWindow(1200),second=sampleFrameTimingWindow(1200);expect(first).toBe(second);
    expect(isFrameTimingSamplingEnabled()).toBe(true);await vi.advanceTimersByTimeAsync(1300);await first;
    expect(readFrameTimingSnapshot().frameCount).toBeGreaterThan(50);expect(isFrameTimingSamplingEnabled()).toBe(false);
    const count=readFrameTimingSnapshot().frameCount;document.dispatchEvent(new Event('visibilitychange'));vi.advanceTimersByTime(5000);
    expect(readFrameTimingSnapshot().frameCount).toBe(count);expect(vi.getTimerCount()).toBe(0);
});
it('preserves continuous desktop diagnostics when a report is copied',async()=>{
    browser();installFrameTimingDiagnostics();await sampleFrameTimingWindow(1200);vi.advanceTimersByTime(1000);
    expect(isFrameTimingSamplingEnabled()).toBe(true);expect(readFrameTimingSnapshot().frameCount).toBeGreaterThan(50);
});
