// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const {check,activate}=vi.hoisted(()=>({check:vi.fn(async()=>({capabilities:{tx:{name:'QQ',qualitys:['128k']}}})),activate:vi.fn()}));
vi.mock('@/services/lxSource/management',()=>({checkLxScript:check}));
vi.mock('@/services/onlineMusic/omni',()=>({omni:{activateLxSource:activate}}));
import { installLxSource } from '@/services/lxSource/installation';
import { useLxSourceStore as store } from '@/stores/useLxSourceStore';

// test/unit/services/lxInstallationConsent.test.ts
const script={id:'a',name:'Fixture',code:'code',version:'1',author:'',description:'',homepage:''};
const confirm=()=>{store.getState().setConsentChecked(true);store.getState().confirmConsent();};
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();store.getState().close();store.setState({extensionEnabled:true,riskAccepted:true,scripts:[],activeId:null,consent:null});});
it('never opens a picker, fetches or executes imported code before acknowledgement',async()=>{
    const load=vi.fn(async()=>script),task=installLxSource(load);
    expect(load).not.toHaveBeenCalled();expect(check).not.toHaveBeenCalled();
    store.getState().confirmConsent();await Promise.resolve();expect(load).not.toHaveBeenCalled();
    store.getState().cancelConsent();expect(await task).toBeNull();expect(store.getState().scripts).toEqual([]);
});
it('installs only after confirmation and asks again for the next import',async()=>{
    const load=vi.fn(async()=>script),task=installLxSource(load);confirm();await task;
    expect(check).toHaveBeenCalledOnce();expect(store.getState().scripts[0].id).toBe('a');expect(activate).toHaveBeenCalledWith('a');
    const next=installLxSource(load);expect(store.getState().consent?.checked).toBe(false);store.getState().cancelConsent();await next;expect(load).toHaveBeenCalledOnce();
});
it.each(['disable','close'] as const)('rejects a pending load after %s without executing or saving',async(action)=>{
    let finish!:(value:typeof script)=>void;const pending=new Promise<typeof script>(resolve=>{finish=resolve;});
    const task=installLxSource(()=>pending);confirm();await Promise.resolve();
    if(action==='disable')await store.getState().setExtensionEnabled(false);else store.getState().close();
    finish(script);await expect(task).rejects.toThrow();expect(check).not.toHaveBeenCalled();expect(store.getState().scripts).toEqual([]);expect(activate).not.toHaveBeenCalled();
});
