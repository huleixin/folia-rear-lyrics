import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {getQuickJS,type QuickJSContext} from 'quickjs-emscripten';
import {lxBootstrap} from '@/services/lxSource/bootstrap';
import {lxProtocol} from '@/services/lxSource/protocol';
import {lxUtility} from '@/services/lxSource/utilities';
import {validateCapabilities,lxQualityAttempts} from '@/services/lxSource/contract';
import {redactLx} from '@/services/lxSource/diagnostics';

// test/unit/services/lxMobileConformance.test.ts
let vm:QuickJSContext|undefined;
afterEach(()=>{vm?.dispose();vm=undefined;});
async function harness(){
    vm=(await getQuickJS()).newContext();const context=vm,events:any[]=[];
    context.newFunction('emit',value=>{events.push(JSON.parse(context.getString(value)));}).consume(h=>context.setProp(context.global,'__emit',h));
    context.newFunction('utility',value=>context.newString(lxUtility(context.getString(value)))).consume(h=>context.setProp(context.global,'__utility',h));
    const run=(code:string)=>{context.unwrapResult(context.evalCode(code)).dispose();context.runtime.executePendingJobs().unwrap();};
    const fixture=readFileSync(resolve('test/fixtures/lx-mobile/contract.js'),'utf8');
    run(lxBootstrap);run(`lx.currentScriptInfo=${JSON.stringify({name:'Tingyu mobile conformance',rawScript:fixture})};__seal();`);run(fixture);
    for(let i=0;i<events.length;i++)if(events[i].kind==='timer')run(`__deliver(${JSON.stringify({id:events[i].id,timer:true})});`);
    const request=(source:string,action:string,test='ok')=>{const id=events.length+1;run(`__request(${JSON.stringify({id,payload:{source,action,info:{type:source==='local'?null:'flac24bit',musicInfo:{test}}}})});`);return events.find(e=>e.kind==='result'&&e.id===id);};
    return {events,run,request};
}
it('uses identical protocol semantics in WASM and the native shim',()=>{
    const native=readFileSync(resolve('android/app/src/main/java/io/github/huleixin/tingyu/lx/LxBootstrap.kt'),'utf8');
    expect(native.split('// BEGIN SHARED MOBILE PROTOCOL')[1].split('// END SHARED MOBILE PROTOCOL')[0].trim().replace(/\r\n/g,'\n')).toBe(lxProtocol.trim().replace(/\r\n/g,'\n'));
});
it('initializes the controlled mobile script including RSA, AES strings, async registration, timers and sandbox protection',async()=>{
    const {events}=await harness();const inited=events.find(e=>e.kind==='inited');expect(inited).toBeTruthy();
    expect(validateCapabilities(inited.data.sources)).toMatchObject({tx:{qualitys:['128k','320k','flac','flac24bit'],actions:['musicUrl']},local:{qualitys:[],actions:['musicUrl','lyric','pic']}});
});
it('requests URLs and preserves the complete special-source lyric structure',async()=>{
    const {request}=await harness();expect(request('tx','musicUrl')).toHaveProperty('value','https://example.com/fixture.wav');
    expect(request('local','musicUrl')).toHaveProperty('value','https://example.com/fixture.wav');
    expect(request('local','lyric').value).toMatchObject({lyric:'[00:00.00]原文',tlyric:'[00:00.00]翻译',rlyric:'[00:00.00]roman',lxlyric:'[00:00.00]<0,100>原文'});
    expect(request('local','pic')).toHaveProperty('value','https://example.com/cover.jpg');
});
it('rejects synchronous handlers and invalid URLs with recoverable request errors',async()=>{
    const {request}=await harness();expect(request('tx','musicUrl','nonpromise').error).toMatch(/Promise/);expect(request('tx','musicUrl','invalid').error).toMatch(/URL/);
    expect(request('tx','musicUrl').value).toBeTruthy();
});
it('enforces one initialization, one update alert and rejects unknown events',async()=>{
    const {run,events}=await harness();run(`lx.send('inited',{}).catch(e=>console.log(e.message));lx.send('updateAlert',{log:'test',updateUrl:'https://example.com/new.js'});lx.send('updateAlert',{log:'duplicate'}).catch(()=>{});lx.on('unknown',()=>{}).catch(()=>{});`);
    expect(events.filter(e=>e.kind==='inited')).toHaveLength(1);expect(events.filter(e=>e.kind==='updateAlert')).toHaveLength(1);
});
it('cancels HTTP callbacks and converts binary payloads to Uint8Array',async()=>{
    const {run,events}=await harness();
    run(`let called=false;const cancel=lx.request('https://example.com',{},()=>{called=true;});cancel();`);
    const http=[...events].reverse().find(e=>e.kind==='http');run(`__deliver({id:${http.id},response:{statusCode:200,body:'ignored'}});if(called)throw Error('late callback');`);
    run(`lx.request('https://example.com',{binary:true},(err,resp,body)=>{if(err||!(body instanceof Uint8Array)||body[1]!==255||resp.body!==body)throw Error('binary');});`);
    run(`__deliver({id:${[...events].reverse().find(e=>e.kind==='http').id},response:{statusCode:200,binary:true,body:[0,255]}});`);
});
it('keeps script capabilities isolated and disallows dynamic code constructors',async()=>{
    const {run}=await harness();run(`for(const fn of [()=>eval('1'),()=>Function('return 1'),()=>({}).constructor.constructor('return 1')]){let blocked=false;try{fn();}catch{blocked=true;}if(!blocked)throw Error('dynamic escape');}if(typeof __emit!=='undefined'||typeof __utility!=='undefined'||typeof localStorage!=='undefined')throw Error('host escape');`);
});
it('only downgrades to declared lower qualities when configured',()=>{
    expect(lxQualityAttempts('hires',['128k','flac','flac24bit'])).toEqual(['flac24bit','flac','128k']);
    expect(lxQualityAttempts('lossless',['128k','flac24bit'],false)).toEqual([]);
    expect(lxQualityAttempts('standard',['flac'])).toEqual([]);
});
it('redacts standalone credentials and signed URLs',()=>{
    expect(redactLx('request https://example.com/?token=private Cookie: session=private')).not.toContain('private');
    expect(redactLx('Token=secret-value')).not.toContain('secret-value');
});

it('treats clearing unknown or already-settled timer IDs as a no-op',async()=>{
    const {run,events}=await harness();const before=events.length;run('for(let i=10000;i<10100;i++)clearTimeout(i);');expect(events).toHaveLength(before);
});
