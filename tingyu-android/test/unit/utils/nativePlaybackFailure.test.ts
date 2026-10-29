import {expect,it} from 'vitest';
import {shouldUseCompatibleDecoder} from '@/utils/nativePlaybackFailure';

// test/unit/utils/nativePlaybackFailure.test.ts
it('keeps source/network failures on Media3 and only falls back for decoder/output failures',()=>{
 for(const nativeCode of [2001,2002,2003,2004,2008,1001])expect(shouldUseCompatibleDecoder({nativeCode} as unknown as MediaError)).toBe(false);
 for(const nativeCode of [3001,3003,4001,4002,5001])expect(shouldUseCompatibleDecoder({nativeCode} as unknown as MediaError)).toBe(true);
 expect(shouldUseCompatibleDecoder(null)).toBe(false);
});
