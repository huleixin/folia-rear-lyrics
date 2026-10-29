import {expect,it,vi,afterEach} from 'vitest';
import {lxHttp} from '@/services/lxSource/http';

// test/unit/services/lxHttp.test.ts
const {http}=vi.hoisted(()=>({http:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>true},CapacitorHttp:{request:http}}));
afterEach(()=>http.mockReset());
it('follows an API redirect while preserving the script callback contract',async()=>{
 http.mockResolvedValueOnce({status:302,headers:{Location:'https://cdn.example/result'},data:''}).mockResolvedValueOnce({status:200,headers:{'Content-Type':'application/json'},data:'{"url":"https://audio.example/song.mp3"}'});
 const result=await lxHttp('https://api.example/start',{headers:{Authorization:'private','X-Token':'private'}},new AbortController().signal);
 expect(result).toMatchObject({statusCode:200,body:{url:'https://audio.example/song.mp3'}});
 expect(http.mock.calls[1][0].headers).not.toHaveProperty('Authorization');expect(http.mock.calls[1][0].headers).not.toHaveProperty('X-Token');
});
it('does not follow redirects to a private destination',async()=>{
 http.mockResolvedValue({status:302,headers:{location:'http://127.0.0.1/private'},data:''});
 await expect(lxHttp('https://api.example/start',{},new AbortController().signal)).rejects.toThrow('公网');expect(http).toHaveBeenCalledTimes(1);
});
it('honours a script timeout beyond the old fixed fifteen second budget',async()=>{
 http.mockResolvedValue({status:200,headers:{},data:'ok'});await lxHttp('https://api.example/start',{timeout:25000},new AbortController().signal);
 expect(http.mock.calls[0][0].readTimeout).toBe(25000);
});
it('stops redirect loops and settles with an explicit error',async()=>{
 http.mockResolvedValue({status:302,headers:{location:'/again'},data:''});await expect(lxHttp('https://api.example/start',{},new AbortController().signal)).rejects.toThrow('重定向');expect(http).toHaveBeenCalledTimes(6);
});
