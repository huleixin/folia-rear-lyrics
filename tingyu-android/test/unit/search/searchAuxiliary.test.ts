import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({sources:['qq','local','kugou','netease'],scope:'a',request:vi.fn()}));
vi.mock('@/services/onlineMusic/omni',()=>({omni:{supportsSearchDiscovery:(id:string)=>id==='qq'||id==='netease',getSearchCapabilities:(id:string)=>({suggest:id==='netease'}),getSearchDiscovery:mocks.request}}));
vi.mock('@/stores/useSearchSettingsStore',()=>({aggregateSearchSources:()=>mocks.sources}));
vi.mock('@/services/onlineMusic/providerResourceScope',()=>({providerSearchScopeKey:()=>mocks.scope}));
import {clearSearchDiscoveryCache,loadSearchDiscovery,searchAuxiliarySource} from '@/services/search/searchAuxiliary';

// test/unit/search/searchAuxiliary.test.ts
beforeEach(()=>{clearSearchDiscoveryCache();mocks.scope='a';mocks.sources=['qq','local','kugou','netease'];mocks.request.mockReset();});
afterEach(()=>vi.useRealTimers());
it('resolves aggregate to enabled providers with the actual capability',async()=>{
    expect(searchAuxiliarySource('aggregate','suggest')).toBe('netease');
    mocks.request.mockResolvedValue({suggestions:[],hot:['real']});
    expect(await loadSearchDiscovery('aggregate')).toMatchObject({providerId:'qq',hot:['real']});
    expect(mocks.request).toHaveBeenCalledWith('qq');
    mocks.sources=['local','kugou'];
    expect(await loadSearchDiscovery('aggregate')).toEqual({suggestions:[],hot:[],providerId:null});
    expect(mocks.request).toHaveBeenCalledTimes(1);
});
it('local and unsupported sources never request online discovery',async()=>{
    await loadSearchDiscovery('local');await loadSearchDiscovery('navidrome');await loadSearchDiscovery('kugou');
    expect(mocks.request).not.toHaveBeenCalled();
});
it('shares inflight calls and prevents an old account response from filling the new cache',async()=>{
    let finish!:(value:unknown)=>void;
    mocks.request.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
    const old=loadSearchDiscovery('qq');expect(loadSearchDiscovery('qq')).toBe(old);
    mocks.scope='b';mocks.request.mockResolvedValue({suggestions:[],hot:['new account']});
    await loadSearchDiscovery('qq');finish({suggestions:[],hot:['old account']});await old;
    expect((await loadSearchDiscovery('qq')).hot).toEqual(['new account']);
    mocks.scope='a';await loadSearchDiscovery('qq');expect(mocks.request).toHaveBeenCalledTimes(3);
});
