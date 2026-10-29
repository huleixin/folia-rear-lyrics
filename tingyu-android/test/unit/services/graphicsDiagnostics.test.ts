// @vitest-environment jsdom
import { afterEach, expect,it,vi } from 'vitest';
import { act,createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { useGraphicsStageProbe } from '@/hooks/useGraphicsStageProbe';
import { installGraphicsDiagnostics, startGraphicsRun, stopGraphicsRun, graphicsWebSnapshot,exportGraphicsReport } from '@/services/graphicsDiagnostics';
import { useAppViewStore } from '@/stores/useAppViewStore';

// test/unit/services/graphicsDiagnostics.test.ts
const bridge=vi.hoisted(()=>({probe:vi.fn(async()=>({mode:'A',webBackdropSampling:true})),share:vi.fn(async(_content:string,_title:string)=> 'shared'),mark:null as null|((v:any)=>void)}));
vi.mock('@capacitor/core',()=>({registerPlugin:()=>({graphicsProbe:bridge.probe,addListener:async(_:string,callback:any)=>{bridge.mark=callback;return {remove:async()=>{}}}})}));
vi.mock('@/utils/graphicsDiagnosticsBuild',()=>({GRAPHICS_DIAGNOSTICS:true}));
vi.mock('@/utils/appSurface',()=>({isMainAppSurface:true}));
vi.mock('@/services/exportDiagnosticReport',()=>({exportDiagnosticReport:bridge.share}));
vi.mock('@/services/playbackTestLog',()=>({readPlaybackTestLog:()=>[]}));
afterEach(()=>{stopGraphicsRun();vi.useRealTimers()});
it('has no sampling loop before an explicit run and records stable React instance/clock state without RAF',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();localStorage.clear();
    const view=useAppViewStore.getState().view;
    useAppViewStore.setState({view:'player'});
    const cleanup=installGraphicsDiagnostics(),root=createRoot(document.createElement('div'));
    const clock={get:()=>53.4};
    const props={currentTime:clock,currentLineIndex:9,seed:'same-song',paused:false} as any;
    function Probe(){useGraphicsStageProbe('partita',props);return null}
    try{
        await act(()=>root.render(h(Probe)));await vi.advanceTimersByTimeAsync(4000);expect(bridge.probe).not.toHaveBeenCalled();
        const first=graphicsWebSnapshot().instances[0].id;
        await act(()=>root.render(h(Probe)));expect(graphicsWebSnapshot().instances[0]).toMatchObject({id:first,clock:53.4,line:9});
        await startGraphicsRun();await vi.advanceTimersByTimeAsync(2200);expect(bridge.probe).toHaveBeenCalledTimes(4);
        document.getElementById('tingyu-web-marker')!.click();await vi.advanceTimersByTimeAsync(1);
        expect(graphicsWebSnapshot().marker).toMatchObject({exists:true,display:'inline-block'});
        await act(()=>root.unmount());expect(graphicsWebSnapshot().rendererMounted).toBe(false);
        stopGraphicsRun('只有歌词闪烁');await exportGraphicsReport();
        const report=JSON.parse(bridge.share.mock.calls.at(-1)![0]);
        expect(report.runs.at(-1).entries.some((e:any)=>e.kind==='react-unmount')).toBe(true);
        expect(report.runs.at(-1).entries.some((e:any)=>e.kind==='web-mark')).toBe(true);
        const count=bridge.probe.mock.calls.length;await vi.advanceTimersByTimeAsync(10000);expect(bridge.probe).toHaveBeenCalledTimes(count);
    }finally{cleanup();useAppViewStore.setState({view});}
});
