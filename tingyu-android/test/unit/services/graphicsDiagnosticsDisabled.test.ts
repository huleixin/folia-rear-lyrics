// @vitest-environment jsdom
import { expect,it,vi } from 'vitest';
import { installGraphicsDiagnostics,startGraphicsRun,exportGraphicsReport } from '@/services/graphicsDiagnostics';

// test/unit/services/graphicsDiagnosticsDisabled.test.ts
const bridge=vi.hoisted(()=>({probe:vi.fn()}));
vi.mock('@capacitor/core',()=>({registerPlugin:()=>({graphicsProbe:bridge.probe})}));
vi.mock('@/utils/graphicsDiagnosticsBuild',()=>({GRAPHICS_DIAGNOSTICS:false}));
it('installs no marker or sampler in a normal build',async()=>{
    vi.useFakeTimers();const cleanup=installGraphicsDiagnostics();
    try{
        await startGraphicsRun();await vi.advanceTimersByTimeAsync(90000);
        expect(document.getElementById('tingyu-web-marker')).toBeNull();expect(bridge.probe).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
        await expect(exportGraphicsReport()).rejects.toThrow('diagnostic build required');
    }finally{cleanup();vi.useRealTimers()}
});
