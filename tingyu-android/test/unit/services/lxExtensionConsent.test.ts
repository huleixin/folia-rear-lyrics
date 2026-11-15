// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useLxSourceStore as store, assertLxImportPermit, DEFAULT_LX_POLICY } from '@/stores/useLxSourceStore';

// test/unit/services/lxExtensionConsent.test.ts
const script={id:'a',name:'Fixture',code:'v1',version:'1',author:'',description:'',homepage:'',capabilities:{tx:{name:'QQ',qualitys:['128k' as const]}}};
const key='tingyu_lx_sources_v1';
const grant=async()=>{const task=store.getState().requestImport();store.getState().setConsentChecked(true);store.getState().confirmConsent();return (await task)!;};
beforeEach(()=>{localStorage.clear();store.getState().cancelConsent();store.setState({scripts:[],activeId:null,extensionEnabled:false,riskAccepted:false,policy:DEFAULT_LX_POLICY,revision:0,open:false});});
afterEach(()=>{store.getState().cancelConsent();vi.restoreAllMocks();});
it('requires an unchecked first-enable acknowledgement and persists accepted state',async()=>{
    const task=store.getState().setExtensionEnabled(true);
    expect(store.getState().consent).toEqual({kind:'enable',checked:false});
    store.getState().confirmConsent();expect(store.getState().extensionEnabled).toBe(false);
    store.getState().setConsentChecked(true);store.getState().confirmConsent();
    expect(await task).toBe(true);expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({extensionEnabled:true,riskAccepted:true});
});
it('cancels and resets confirmation, including switching off while enable is pending',async()=>{
    const task=store.getState().setExtensionEnabled(true);store.getState().setConsentChecked(true);
    await store.getState().setExtensionEnabled(false);expect(await task).toBe(false);
    const retry=store.getState().setExtensionEnabled(true);expect(store.getState().consent?.checked).toBe(false);
    store.getState().cancelConsent();expect(await retry).toBe(false);
});
it('requires new consent for every import and rejects forged, consumed and revoked permits',async()=>{
    store.setState({extensionEnabled:true,riskAccepted:true});
    expect(()=>assertLxImportPermit({kind:'lx-import'})).toThrow();
    const first=await grant();store.getState().save(script,first);expect(()=>assertLxImportPermit(first)).toThrow();
    const task=store.getState().requestImport();expect(store.getState().consent?.checked).toBe(false);
    store.getState().confirmConsent();expect(store.getState().consent).not.toBeNull();store.getState().cancelConsent();expect(await task).toBeNull();
    const second=await grant();store.getState().close();expect(()=>assertLxImportPermit(second)).toThrow();
    const third=await grant();await store.getState().setExtensionEnabled(false);expect(()=>assertLxImportPermit(third)).toThrow();
    expect(await store.getState().requestImport()).toBeNull();
});
it('preserves scripts, selection and policy across off/on and still permits deletion while off',async()=>{
    store.setState({extensionEnabled:true,riskAccepted:true,scripts:[script],activeId:'a',policy:{...DEFAULT_LX_POLICY,routing:'original-first'}});
    await store.getState().setExtensionEnabled(false);
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({extensionEnabled:false,activeId:'a',scripts:[script],policy:{routing:'original-first'}});
    expect(()=>store.getState().activate('a')).toThrow();expect(()=>store.getState().setPolicy({retries:1})).toThrow();
    await store.getState().setExtensionEnabled(true);expect(store.getState().activeId).toBe('a');expect(store.getState().consent).toBeNull();
    await store.getState().setExtensionEnabled(false);store.getState().remove('a');expect(store.getState().scripts).toEqual([]);
});
it('does not acknowledge or enable when persistence fails',async()=>{
    const task=store.getState().setExtensionEnabled(true);store.getState().setConsentChecked(true);
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});
    expect(()=>store.getState().confirmConsent()).toThrow('quota');expect(store.getState().extensionEnabled).toBe(false);
    expect(store.getState().riskAccepted).toBe(false);store.getState().cancelConsent();expect(await task).toBe(false);
});
it.each([
    ['fresh',{},false],['active legacy',{scripts:[script],activeId:'a'},true],
    ['inactive legacy',{scripts:[script],activeId:null},false],['explicitly disabled',{scripts:[script],activeId:'a',extensionEnabled:false,riskAccepted:true},false],
    ['invalid selection',{scripts:[script,null],activeId:'missing'},false],
])('loads %s installations without losing stored configuration',async(_name,data,enabled)=>{
    localStorage.setItem(key,JSON.stringify(data));vi.resetModules();
    const module=await import('@/stores/useLxSourceStore');const state=module.useLxSourceStore.getState();
    expect(state.extensionEnabled).toBe(enabled);expect(state.consent).toBeNull();
    if('scripts' in data)expect(state.scripts).toEqual([script]);
});
