// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const settings=vi.hoisted(()=>({save:vi.fn()}));
vi.mock('@/utils/platform',()=>({isAndroidNativeRuntime:()=>true}));
vi.mock('@/services/navigationTiming',()=>({navigationDiagnosticsEnabled:()=>false,setNavigationDiagnostics:settings.save}));
import StartupDiagnosticsControl from '@/components/modal/StartupDiagnosticsControl';

// test/unit/settings/startupDiagnosticsControl.test.ts
it('persists the user toggle and exposes phone-only reproduction instructions',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    settings.save.mockResolvedValue(undefined);
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    await act(async()=>root.render(createElement(StartupDiagnosticsControl)));
    const button=host.querySelector('button')!;
    await act(async()=>button.click());
    expect(settings.save).toHaveBeenLastCalledWith(true);expect(button.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain('强行停止');expect(host.textContent).toContain('导出诊断数据');
    await act(async()=>button.click());
    expect(settings.save).toHaveBeenLastCalledWith(false);expect(button.getAttribute('aria-checked')).toBe('false');
    await act(async()=>root.unmount());host.remove();
});
it('keeps the previous state and shows an error if native configuration fails',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    settings.save.mockRejectedValue(Error('bridge failed'));
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    await act(async()=>root.render(createElement(StartupDiagnosticsControl)));
    await act(async()=>host.querySelector('button')!.click());
    expect(host.querySelector('button')?.getAttribute('aria-checked')).toBe('false');expect(host.querySelector('[role="alert"]')).not.toBeNull();
    await act(async()=>root.unmount());host.remove();
});
