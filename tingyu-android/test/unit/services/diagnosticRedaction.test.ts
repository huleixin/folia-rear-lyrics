import {expect,it} from 'vitest';
import {redactDiagnosticReport} from '@/utils/diagnosticRedaction';
// test/unit/services/diagnosticRedaction.test.ts
it('keeps useful session timing while stripping playback URLs and credentials',()=>{
 const report=redactDiagnosticReport('session=uuid event=12 positionMs=4000\nurl=https://audio.example/song?key=secret\nCookie: user=secret\nAuthorization: Bearer secret\naccess_token=secret\n{"token":"secret"}');
 expect(report).toContain('positionMs=4000');expect(report).not.toContain('audio.example');expect(report).not.toContain('secret');
});
