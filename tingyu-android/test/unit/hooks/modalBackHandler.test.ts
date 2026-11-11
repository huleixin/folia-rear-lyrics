// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useModalBackHandler } from '@/hooks/useModalBackHandler';
import { resetModalBackStack, runTopModalBack, hasRegisteredModal } from '@/services/modalBackStack';

// test/unit/hooks/modalBackHandler.test.ts
it('keeps opening order through callback refreshes and cleans up on unmount',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    resetModalBackStack();
    const a=createRoot(document.createElement('div')), b=createRoot(document.createElement('div'));
    const old=vi.fn(), fresh=vi.fn(), top=vi.fn();
    function Modal({onBack}:{onBack:()=>void}) { useModalBackHandler(true,onBack); return null; }
    try {
        await act(async()=>a.render(h(Modal,{onBack:old})));
        await act(async()=>b.render(h(Modal,{onBack:top})));
        await act(async()=>a.render(h(Modal,{onBack:fresh})));
        expect(runTopModalBack()).toBe(true); expect(top).toHaveBeenCalledOnce();
        expect(fresh).not.toHaveBeenCalled(); expect(old).not.toHaveBeenCalled();
        await act(async()=>b.unmount());
        runTopModalBack(); expect(fresh).toHaveBeenCalledOnce();
    } finally { await act(async()=>a.unmount()); resetModalBackStack(); }
    expect(hasRegisteredModal()).toBe(false);
});
