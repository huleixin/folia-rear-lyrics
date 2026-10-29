import {expect,it} from 'vitest';
import {GRAPHICS_MODES,canChangeGraphicsMode} from '@/utils/graphicsDiagnosticsBuild';

// test/unit/utils/graphicsDiagnosticsMode.test.ts
it('permits only one variable away from the common baseline',()=>{
    for(const mode of GRAPHICS_MODES){expect(canChangeGraphicsMode('A',mode)).toBe(true);expect(canChangeGraphicsMode(mode,'A')).toBe(true)}
    expect(canChangeGraphicsMode('B','C31')).toBe(false);expect(canChangeGraphicsMode('C31','C_HW')).toBe(false);
});
