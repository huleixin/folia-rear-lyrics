// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {installFetchShim} from '../../../src/services/nativeAndroidBridge';
// Test the real fetch shim, including native cancellation rather than a JS-only race.
const originalFetch=window.fetch;
afterEach(()=>{window.fetch=originalFetch;vi.useRealTimers();});
describe('native HTTP cancellation',()=>{
    it('forwards AbortSignal and rejects without waiting for native I/O',async()=>{
        const plugin={httpRequest:vi.fn((_options:Record<string,unknown>)=>new Promise(()=>{})),cancelHttpRequest:vi.fn(async()=>({}))};
        window.fetch=vi.fn() as typeof fetch;
        installFetchShim(plugin as any);
        const controller=new AbortController();
        const pending=window.fetch('https://u.y.qq.com/cgi-bin/musicu.fcg',{signal:controller.signal});
        for(let i=0;i<10;i++)await Promise.resolve();
        const assertion=expect(pending).rejects.toMatchObject({name:'AbortError'});
        controller.abort();await assertion;
        expect(plugin.cancelHttpRequest).toHaveBeenCalledWith({requestId:plugin.httpRequest.mock.calls[0][0].requestId});
    });
});
