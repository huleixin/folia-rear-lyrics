// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { useDebugLyricIndex } from '@/hooks/useDebugLyricIndex';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

// test/unit/hooks/debugLyricIndex.test.ts
it('isolates invisible debug UI from line traffic and catches up when opened', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host), initial = usePlaybackStore.getState().currentLineIndex;
    let renders = 0, seen = -1;
    function Probe({ enabled }: {enabled:boolean}) { seen=useDebugLyricIndex(enabled); renders++; return h('span',null,seen); }
    try {
        await act(async()=>root.render(h(Probe,{enabled:false})));
        const start=renders;
        for(let i=0;i<60;i++) await act(async()=>usePlaybackStore.getState().setCurrentLineIndex(i));
        expect(renders-start).toBe(0); expect(seen).toBe(-1);
        await act(async()=>root.render(h(Probe,{enabled:true})));
        expect(seen).toBe(59);
        const visible=renders;
        for(let i=60;i<120;i++) await act(async()=>usePlaybackStore.getState().setCurrentLineIndex(i));
        expect(renders-visible).toBe(60); expect(seen).toBe(119);
        await act(async()=>root.render(h(Probe,{enabled:false})));
        const closed=renders;
        await act(async()=>usePlaybackStore.getState().setCurrentLineIndex(61));
        expect(renders).toBe(closed);
    } finally {
        await act(async()=>root.unmount()); host.remove();
        usePlaybackStore.getState().setCurrentLineIndex(initial);
    }
});
