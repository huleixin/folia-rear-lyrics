// @vitest-environment jsdom
import { expect,it } from 'vitest';
import {canPublishNativeStage} from '@/utils/nativeStageCommit';

// test/unit/services/nativeStageCommit.test.ts
it('does not reveal a stage while the DOM still belongs to home or startup',()=>{
    const root=document.createElement('div');
    expect(canPublishNativeStage('stage',null)).toBe(false);
    expect(canPublishNativeStage('stage',root)).toBe(false);
    root.setAttribute('data-folia-player-view','true');
    expect(canPublishNativeStage('stage',root)).toBe(true);
    root.removeAttribute('data-folia-player-view');
    expect(canPublishNativeStage('stage',root)).toBe(false);
    for(const route of ['home','collection','search','settings'])expect(canPublishNativeStage(route,root)).toBe(true);
});
