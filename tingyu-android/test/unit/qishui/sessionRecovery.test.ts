import { beforeEach, afterEach, expect, it, vi } from 'vitest';

// test/unit/qishui/sessionRecovery.test.ts
// Exercise the production Android protocol with persistent storage across simulated restarts.
const values = new Map<string, string>();
let key: string;
let current: Record<string, any>;
const json = (data: unknown, headers = {}) => new Response(JSON.stringify(data), {headers});
const me = () => json({data: {my_info: {id: 'account-test', nickname: 'Listener'}}});
const rejected = () => json({err_no: 28001003});
const ticket = () => json({}, {'bd-ticket-guard-server-data': btoa(JSON.stringify({ticket: 'new-test-ticket', ts_sign: 'new-sign', client_cert: 'new-cert'}))});
const saved = () => JSON.parse(values.get('qishuiSessionV1') || 'null');
beforeEach(async () => {
    vi.resetModules(); values.clear();
    vi.stubGlobal('localStorage', {getItem: (k: string) => values.get(k) ?? null, setItem: (k: string,v: string) => values.set(k,v), removeItem: (k: string) => values.delete(k)});
    const {createQishuiGuard} = await import('@/nativeBridge/api/qishui.js');
    key = (await createQishuiGuard()).guardKey;
    current = {version: 1, deviceId: '1234567890123456789', userId: 'account-test', user: {id: 'account-test', nickname: 'Listener'},
        ticket: 'old-test-ticket', guardKey: key, guardCert: 'cert', guardTsSign: 'sign', accessCode: 'old-code', openId: 'open-test', expiresAt: Date.now()+8*3600000};
    values.set('qishuiSessionV1',JSON.stringify(current)); values.set('qishuiDeviceId',current.deviceId);
});
afterEach(()=>vi.unstubAllGlobals());
it('restores a saved account after a cold restart without requesting a QR code',async()=>{
    const fetch=vi.fn(async()=>me());vi.stubGlobal('fetch',fetch);
    let {handleQishuiRequest}=await import('@/nativeBridge/api/qishui.js');
    expect(await handleQishuiRequest('login_status')).toMatchObject({ok:true,data:{id:'account-test'}});
    vi.resetModules();({handleQishuiRequest}=await import('@/nativeBridge/api/qishui.js'));
    expect(await handleQishuiRequest('login_status')).toMatchObject({ok:true,data:{id:'account-test'}});
    expect(fetch.mock.calls).toHaveLength(2);
});
it('renews a rejected guard ticket using the still-valid saved authorization',async()=>{
    let users=0;
    const fetch=vi.fn(async(url: string)=>url.includes('get_access_ticket')?ticket():++users===1?rejected():me());vi.stubGlobal('fetch',fetch);
    const {handleQishuiRequest}=await import('@/nativeBridge/api/qishui.js');
    expect(await handleQishuiRequest('login_status')).toMatchObject({ok:true,data:{id:'account-test'}});
    expect(fetch.mock.calls.filter(([url])=>url.includes('get_access_ticket'))).toHaveLength(1);
    expect(saved()).toMatchObject({ticket:'new-test-ticket',accessCode:'old-code',expiresAt:current.expiresAt});
});
it('saves a rotated access code before a ticket network failure and recovers after restart',async()=>{
    values.set('qishuiSessionV1',JSON.stringify({...current,expiresAt:Date.now()+1000}));
    const fetch=vi.fn(async(url: string)=>{
        if(url.includes('/refresh/'))return json({data:{access_code:'rotated-code',expires_time:Date.now()+8*3600000}});
        throw new Error('simulated network outage');
    });vi.stubGlobal('fetch',fetch);
    let {handleQishuiRequest}=await import('@/nativeBridge/api/qishui.js');
    expect(await handleQishuiRequest('login_status')).toMatchObject({ok:false,error:{code:'network'}});
    expect(saved()).toMatchObject({accessCode:'rotated-code',ticket:'old-test-ticket',userId:'account-test'});
    vi.resetModules();let users=0;
    fetch.mockImplementation(async(url: string)=>url.includes('get_access_ticket')?ticket():++users===1?rejected():me());
    ({handleQishuiRequest}=await import('@/nativeBridge/api/qishui.js'));
    expect(await handleQishuiRequest('login_status')).toMatchObject({ok:true,data:{id:'account-test'}});
    expect(saved()).toMatchObject({accessCode:'rotated-code',ticket:'new-test-ticket'});
});
it('keeps a newly issued ticket when account verification temporarily loses the network',async()=>{
    values.set('qishuiSessionV1',JSON.stringify({...current,expiresAt:Date.now()+1000}));
    vi.stubGlobal('fetch',async(url: string)=>{
        if(url.includes('/refresh/'))return json({data:{access_code:'rotated-code',expires_time:Date.now()+8*3600000}});
        if(url.includes('get_access_ticket'))return ticket();
        throw new Error('offline');
    });
    const {handleQishuiRequest}=await import('@/nativeBridge/api/qishui.js');
    expect(await handleQishuiRequest('login_status')).toMatchObject({ok:false,error:{code:'network'}});
    expect(saved()).toMatchObject({ticket:'new-test-ticket',accessCode:'rotated-code',userId:'account-test'});
});
it('retains the saved account on an ordinary network failure',async()=>{
    vi.stubGlobal('fetch',async()=>{throw new Error('offline')});
    const {handleQishuiRequest}=await import('@/nativeBridge/api/qishui.js');
    expect(await handleQishuiRequest('login_status')).toMatchObject({ok:false,error:{code:'network'}});
    expect(saved()).toEqual(current);
});
it('clears an authorization that is still explicitly rejected after ticket recovery',async()=>{
    vi.stubGlobal('fetch',async(url: string)=>url.includes('get_access_ticket')?ticket():rejected());
    const {handleQishuiRequest}=await import('@/nativeBridge/api/qishui.js');
    expect(await handleQishuiRequest('login_status')).toMatchObject({ok:false,error:{code:'auth-required'}});
    expect(saved()).toBeNull();
});
it('does not restore credentials if the user logs out while renewal is in flight',async()=>{
    let resolve!:(value:Response)=>void;
    vi.stubGlobal('fetch',()=>new Promise<Response>(r=>{resolve=r}));
    const {handleQishuiRequest}=await import('@/nativeBridge/api/qishui.js');
    const pending=handleQishuiRequest('login_status');
    await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));
    await handleQishuiRequest('logout');resolve(me());await pending;
    expect(saved()).toBeNull();
});
