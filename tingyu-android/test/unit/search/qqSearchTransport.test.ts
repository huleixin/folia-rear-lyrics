// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { searchQqMusicByType } from '@/services/onlineMusic/qqSearchTransport';
import { requestFoliaExtension } from '@/services/foliaExtensionBridge';

// test/unit/search/qqSearchTransport.test.ts
vi.mock('@/services/foliaExtensionBridge',()=>({
    isFoliaExtensionBridgeAvailable:()=>Promise.resolve(true),isFoliaExtensionBridgeConfigured:()=>true,
    requestFoliaExtension:vi.fn(),
}));
beforeEach(()=>vi.clearAllMocks());

it.each(['singer','album'] as const)('retains the real QQ refusal code for %s when HTTP/outer status is successful',async type=>{
    vi.mocked(requestFoliaExtension).mockResolvedValue({code:0,request:{code:2001,data:{code:0,body:{},meta:{sum:0}}}});
    await expect(searchQqMusicByType(type,'茶汤',20,0)).rejects.toThrow('QQ musicu error: 2001');
});
it('rejects a failed inner data block instead of treating it as an empty category',async()=>{
    vi.mocked(requestFoliaExtension).mockResolvedValue({code:0,request:{code:0,data:{code:500,body:{singer:[]},meta:{sum:0}}}});
    await expect(searchQqMusicByType('singer','茶汤',20,0)).rejects.toThrow('QQ musicu error: 500');
});
it.each([
    ['singer','singer',1,{singerMID:'000NUoMp2WAEpO',singerName:'郁可唯'}],
    ['album','item_album',2,{albummid:'003Qz6jr1JvYTN',name:'微加幸福'}],
] as const)('reads successful %s results and keeps the correct category/page in the bridge request',async(type,key,code,item)=>{
    vi.mocked(requestFoliaExtension).mockResolvedValue({code:0,request:{code:0,data:{code:0,body:{[key]:[item]},meta:{sum:21,nextpage:2}}}});
    await expect(searchQqMusicByType(type,'茶汤',20,20)).resolves.toMatchObject({items:[item],total:21,more:true});
    expect(requestFoliaExtension).toHaveBeenCalledWith(expect.objectContaining({provider:'qq_raw',operation:'musicu',body:expect.objectContaining({request:expect.objectContaining({param:expect.objectContaining({search_type:code,page_num:2})})})}));
});
