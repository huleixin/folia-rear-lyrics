// @vitest-environment jsdom
import React,{act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {useRearSettingsController,type RearSettingsController} from '@/components/modal/settings/useRearSettingsController';
import RearLyricsGuide from '@/components/modal/settings/RearLyricsGuide';
import type {RearLyricsStatus} from '@/services/rearLyricsControl';

const mock=vi.hoisted(()=>({get:vi.fn(),start:vi.fn(),stop:vi.fn(),backend:vi.fn(),engine:vi.fn(),route:vi.fn(),cover:vi.fn(),report:vi.fn(),export:vi.fn(),redact:vi.fn()}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('@/services/rearLyricsControl',()=>({rememberRearControlStatus:vi.fn(),toggleRearCardKeepAwake:vi.fn(),toggleRearCardAod:vi.fn(),canUseRearLyrics:()=>true,rearLyricsPlugin:()=>({getRearLyricsStatus:mock.get,startRearLyrics:mock.start,returnFromRearLyrics:mock.stop}),setRearLyricsBackend:mock.backend,setRearControlEngine:mock.engine,setRearLockedRoute:mock.route,toggleRearCoverSleep:mock.cover}));
vi.mock('@/utils/buildDiagnosticReport',()=>({buildDiagnosticReport:mock.report}));
vi.mock('@/services/exportDiagnosticReport',()=>({exportDiagnosticReport:mock.export}));
vi.mock('@/utils/diagnosticRedaction',()=>({redactDiagnosticReport:mock.redact}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement,current:RearSettingsController,status:RearLyricsStatus;
function Probe(){current=useRearSettingsController();return null;}
beforeEach(()=>{
    vi.useFakeTimers();vi.clearAllMocks();Object.defineProperty(document,'hidden',{configurable:true,value:false});
    status={backendMode:'lsp',enabled:false,active:false,rearDisplayId:1,lspConnected:true,controlEngine:'plan-a',lockedRoute:'auto',sensorAvailable:true};
    mock.get.mockImplementation(async()=>({...status}));mock.start.mockResolvedValue({verified:true});mock.stop.mockResolvedValue(undefined);
    for(const fn of [mock.backend,mock.engine,mock.route,mock.cover])fn.mockResolvedValue(true);
    mock.report.mockResolvedValue('all-existing-fields\ntoken=secret');mock.redact.mockReturnValue('all-existing-fields\ntoken=[redacted]');mock.export.mockResolvedValue('shared');
    host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();});
it('mount, refresh and status changes never automatically start, stop or change backend',async()=>{
    await act(async()=>root.render(createElement(Probe)));
    await act(async()=>{vi.advanceTimersByTime(9000);});
    expect(mock.start).not.toHaveBeenCalled();expect(mock.stop).not.toHaveBeenCalled();expect(mock.backend).not.toHaveBeenCalled();
    expect(current.snapshot?.backendMode).toBe('lsp');
});
it('shares an immediate operation lock between toggle and backend selection',async()=>{
    await act(async()=>root.render(createElement(Probe)));
    await act(async()=>{await Promise.all([current.toggle(),current.change('backend','shizuku')]);});
    expect(mock.start).toHaveBeenCalledTimes(1);expect(mock.backend).not.toHaveBeenCalled();
});
it('never optimistically reports successful activation after an unverified launch',async()=>{
    mock.start.mockResolvedValue({verified:false});await act(async()=>root.render(createElement(Probe)));
    await act(async()=>{await current.toggle();});
    expect(current.actionFailed).toBe(true);expect(current.snapshot?.enabled).toBe(false);
});
it('enforces active mode locks and hides Shizuku-only operations from LSP actions',async()=>{
    status.enabled=true;await act(async()=>root.render(createElement(Probe)));
    await act(async()=>{await current.change('backend','shizuku');await current.change('engine','legacy');await current.change('route','reuse');});
    expect(mock.backend).not.toHaveBeenCalled();expect(mock.engine).not.toHaveBeenCalled();expect(mock.route).not.toHaveBeenCalled();
    expect(current.error).toBe('rearControl.stopBeforeSwitch');
});
it('refreshes saved configuration and surfaces a real rejected action',async()=>{
    mock.engine.mockImplementation(async()=>{status.controlEngine='legacy';return true;});await act(async()=>root.render(createElement(Probe)));
    await act(async()=>{await current.change('engine','legacy');});expect(current.snapshot?.controlEngine).toBe('legacy');
    mock.backend.mockResolvedValue(false);await act(async()=>{await current.change('backend','shizuku');});
    expect(current.error).toBe('rearBridge.failed');expect(current.snapshot?.backendMode).toBe('lsp');
});
it('diagnostics stays directly reachable and exports the complete report through existing redaction',async()=>{
    await act(async()=>root.render(createElement<{backend:'lsp';diagnosticsOnly:boolean}>(RearLyricsGuide,{backend:'lsp',diagnosticsOnly:true})));
    expect(host.querySelector('details')?.open).toBe(false);
    await act(async()=>{host.querySelector('summary')!.click();});
    expect(host.querySelector('details')?.open).toBe(true);expect(host.textContent).toContain('backend=lsp');
    expect(mock.report).not.toHaveBeenCalled();
    await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='help.exportDiagnostics')!.click();});
    expect(mock.report).toHaveBeenCalledTimes(1);expect(mock.redact).toHaveBeenCalledWith('all-existing-fields\ntoken=secret');
    expect(mock.export).toHaveBeenCalledWith('all-existing-fields\ntoken=[redacted]','help.exportDiagnostics');
});
it('does not let a pre-write status poll overwrite a saved preference',async()=>{
    await act(async()=>root.render(createElement(Probe)));
    let release!:(value:RearLyricsStatus)=>void;
    const stale={...status};mock.get.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    act(()=>{void current.refresh();});
    mock.engine.mockImplementation(async()=>{status.controlEngine='legacy';return true;});
    await act(async()=>{const write=current.change('engine','legacy');release(stale);await write;});
    expect(current.snapshot?.controlEngine).toBe('legacy');
});

it('explicit show after swipe reuses the saved enabled preference without toggling it off',async()=>{
    status={...status,enabled:true,active:false,userDismissed:true,returnedToSystem:true};
    await act(async()=>root.render(createElement(Probe)));
    await act(async()=>{await current.show();});
    expect(mock.start).toHaveBeenCalledTimes(1);expect(mock.stop).not.toHaveBeenCalled();
});
