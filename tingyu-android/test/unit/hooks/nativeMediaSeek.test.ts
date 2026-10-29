// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { useNativeMediaActions } from '@/hooks/useNativeMediaActions';

// test/unit/hooks/nativeMediaSeek.test.ts
it('routes system seeks without turning a paused song into Play, and rejects invalid positions',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const actions={play:vi.fn(),pause:vi.fn(),toggle:vi.fn(),next:vi.fn(),previous:vi.fn(),seek:vi.fn()};
    const root=createRoot(document.createElement('div'));
    function Probe(){useNativeMediaActions(actions);return null}
    try{
        await act(()=>root.render(h(Probe)));
        for(const position of [72.5,-10,NaN,Infinity,'30',undefined])window.dispatchEvent(new CustomEvent('folia-native-media-action',{detail:{action:'seek',position}}));
        expect(actions.seek.mock.calls).toEqual([[72.5],[0]]);expect(actions.play).not.toHaveBeenCalled();expect(actions.toggle).not.toHaveBeenCalled();
    }finally{await act(()=>root.unmount())}
});
