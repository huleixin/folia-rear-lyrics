import { describe, it, expect } from 'vitest';
import { getQuickJS } from 'quickjs-emscripten';
import { useLxSourceStore } from '../../../src/stores/useLxSourceStore';
import { getSongResourceCacheKey, getLegacySongResourceCacheKeys } from '../../../src/services/onlineMusic/resourceKeys';
import type { SongResult } from '../../../src/types';
import { lxBootstrap } from '../../../src/services/lxSource/bootstrap';
import { lxUtility } from '../../../src/services/lxSource/utilities';
import { chooseLxQuality, parseLxScript, validateCapabilities, validateRemoteUrl } from '../../../src/services/lxSource/contract';

// test/unit/services/lxSource.test.ts
describe('LX source protocol', () => {
    it('isolates custom-source audio caches from original and other scripts', () => {
        const song = {id:123, sourceRef:{kind:'online',providerId:'netease',mediaId:'123'}} as SongResult;
        useLxSourceStore.setState({activeId:null});
        const original = getSongResourceCacheKey('audio',song);
        try {
            useLxSourceStore.setState({activeId:'one'});
            const one = getSongResourceCacheKey('audio',song);
            expect(one).not.toBe(original);
            expect(getLegacySongResourceCacheKeys('audio',song)).toEqual([]);
            useLxSourceStore.setState({activeId:'two'});
            expect(getSongResourceCacheKey('audio',song)).not.toBe(one);
            expect(getSongResourceCacheKey('lyric',song)).not.toContain('lx_');
        } finally { useLxSourceStore.setState({activeId:null}); }
    });
    it('parses UTF8 metadata and refuses oversized or unnamed scripts', () => {
        expect(parseLxScript('/**\n * @name 测试源\n * @version 1.2\n */\nconst ok = true').name).toBe('测试源');
        expect(() => parseLxScript('const name="bad"')).toThrow();
        expect(() => parseLxScript('x'.repeat(1048577))).toThrow();
    });
    it('only accepts declared URL capability and supported qualities', () => {
        const caps = validateCapabilities({ wy: { type:'music', actions:['musicUrl'], qualitys:['flac','bad'] }, other: {} });
        expect(caps.wy.qualitys).toEqual(['flac']);
        expect(chooseLxQuality('hires', caps.wy.qualitys)).toBe('flac');
        expect(() => validateCapabilities({ wy: { actions:['pic'], qualitys:['128k'] } })).toThrow();
    });
    it.each(['http://127.0.0.1/test','http://192.168.1.1/test','http://localhost/test','file:///etc','http://[::1]/','http://user:pass@example.com'])('rejects non-public destination %s', url => { expect(() => validateRemoteUrl(url)).toThrow(); });
    it('supports buffer, MD5 and deterministic AES helpers', () => {
        expect(JSON.parse(lxUtility(JSON.stringify({ op:'md5', args:['abc'] }))).value).toBe('900150983cd24fb0d6963f7d28e17f72');
        expect(JSON.parse(lxUtility(JSON.stringify({ op:'buffer', args:['测试','utf8'] }))).value).toEqual(Array.from(new TextEncoder().encode('测试')));
        expect(JSON.parse(lxUtility(JSON.stringify({ op:'random', args:[-1] }))).error).toBeTruthy();
    });
    it('isolates app capabilities and executes async request / callback protocol', async () => {
        const module = await getQuickJS(); const vm = module.newContext(); const events: any[] = [];
        try {
            vm.newFunction('emit', value => { events.push(JSON.parse(vm.getString(value))); }).consume(h => vm.setProp(vm.global,'__emit',h));
            vm.newFunction('utility', value => vm.newString(lxUtility(vm.getString(value)))).consume(h => vm.setProp(vm.global,'__utility',h));
            vm.unwrapResult(vm.evalCode(lxBootstrap)).dispose();
            vm.unwrapResult(vm.evalCode(`
                if(typeof window!=='undefined'||typeof fetch!=='undefined'||typeof indexedDB!=='undefined')throw Error('escape');
                lx.on(lx.EVENT_NAMES.request,()=>new Promise((resolve,reject)=>lx.request('https://example.com',{},(error,resp)=>error?reject(error):resolve(resp.body.url))));
                lx.send(lx.EVENT_NAMES.inited,{sources:{wy:{type:'music',actions:['musicUrl'],qualitys:['128k']}}});
                __request({id:7,payload:{source:'wy',action:'musicUrl',info:{}}});
            `)).dispose();
            vm.runtime.executePendingJobs().unwrap();
            const http = events.find(e => e.kind === 'http'); expect(http).toBeTruthy();
            vm.unwrapResult(vm.evalCode(`__deliver(${JSON.stringify({ id:http.id,response:{statusCode:200,body:{url:'https://example.com/song.mp3'}} })})`)).dispose();
            vm.runtime.executePendingJobs().unwrap();
            expect(events.find(e => e.kind === 'result')).toMatchObject({ id:7,value:'https://example.com/song.mp3' });
        } finally { vm.dispose(); }
    });
    it('interrupts a runaway script', async () => {
        const vm = (await getQuickJS()).newContext(); let cycles=0;
        try { vm.runtime.setInterruptHandler(() => ++cycles > 10); const result = vm.evalCode('while(true){}'); expect(result.error).toBeTruthy(); result.dispose(); }
        finally { vm.dispose(); }
    });
});
