import {expect,it,vi,afterEach} from 'vitest';
import {lxHttp} from '@/services/lxSource/http';

// test/unit/services/lxHttp.test.ts
const {http,cancel}=vi.hoisted(()=>({http:vi.fn(),cancel:vi.fn(async()=>{})}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>true}}));
vi.mock('@/platform/tingyuPlayback',()=>({getTingyuPlayback:()=>({lxHttp:http,cancelLxHttp:cancel})}));
afterEach(()=>{http.mockReset();cancel.mockClear();});
it('uses the shared isolated native transport without dropping POST body or headers',async()=>{
    http.mockResolvedValue({response:JSON.stringify({statusCode:201,statusMessage:'Created',headers:{},body:{url:'https://audio.example/song.mp3'}})});
    const options={method:'POST',timeout:45000,body:{id:42},headers:{Cookie:'script=yes'}};
    expect(await lxHttp('https://api.example/resolve',options,new AbortController().signal)).toMatchObject({statusCode:201,body:{url:'https://audio.example/song.mp3'}});
    expect(http.mock.calls[0][0].options).toEqual(options);
});
it('passes cancellation to the actual native request and drops a late result',async()=>{
    let complete!:(value:unknown)=>void;http.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
    const controller=new AbortController(),request=lxHttp('https://api.example/resolve',{},controller.signal);
    controller.abort();expect(cancel).toHaveBeenCalledWith({id:http.mock.calls[0][0].id});
    complete({response:'{}'});await expect(request).rejects.toThrow('Cancelled');
});
it('refuses private destinations before invoking any bridge method',async()=>{
    await expect(lxHttp('http://127.0.0.1/private',{},new AbortController().signal)).rejects.toThrow('公网');expect(http).not.toHaveBeenCalled();
});
it('keeps binary bytes intact for the sandbox callback',async()=>{
    http.mockResolvedValue({response:JSON.stringify({statusCode:200,headers:{},binary:true,body:[0,255]})});
    expect((await lxHttp('https://api.example/binary',{binary:true},new AbortController().signal)).body).toEqual([0,255]);
});
