import {describe,it,expect} from 'vitest';
import {sanitizeFeedback,validateFeedback,safeStack,evidence} from '@/services/feedback/schema.mjs';
import {previousFailure} from '@/services/feedback/crashRecovery';

// test/unit/diagnostics/cloudFeedback.test.ts: privacy boundaries and prior-session crash selection.
describe('cloud diagnostics',()=>{
 it('keeps code locations and removes exception payloads and unknown fields',()=>{
  const stack=safeStack('Error: Cookie=secret\n at play (https://localhost/assets/audio.js:4:7)\nCaused by: java.lang.Error: password=secret\n at java.lang.Thread.run(Thread.java:5)');
  expect(stack).toContain('audio.js:4:7');expect(stack).toContain('Thread.java:5');expect(stack).not.toMatch(/password|Cookie|localhost|secret/);
  const clean=sanitizeFeedback({category:'playback',description:'failed',metadata:{version:'1.5.40'},diagnostics:{events:[{m:'audio',l:'error',e:'failure',f:{cookie:'unsafe',errorCode:4,lyrics:'private'}}],crashes:[]}});
  expect(validateFeedback(clean)).toEqual(clean);expect(()=>validateFeedback({...clean,password:'secret'})).toThrow();expect(evidence(clean).key).toContain('audio');
 });
 it('selects prior errors, excluding navigation breadcrumbs and current-session errors',()=>{
  const before=Date.now(),base={type:'Error',message:'',at:before-1000};
  const found=previousFailure([{...base,source:'activity-lifecycle',type:'onCreate'},{...base,source:'native-uncaught'},{...base,at:before+1,source:'window-error'}],before);
  expect(found?.source).toBe('native-uncaught');
 });
});
