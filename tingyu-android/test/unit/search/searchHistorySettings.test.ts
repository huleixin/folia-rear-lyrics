import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('@/services/onlineMusic/omni',()=>({omni:{getProviderSummaries:()=>[{providerId:'qq',availability:{configured:true}},{providerId:'netease',availability:{configured:true}}],getSearchCapabilities:()=>({song:true})}}));
import {sanitizeSearchHistory,useSearchHistoryStore} from '@/stores/useSearchHistoryStore';
import {useSearchSettingsStore} from '@/stores/useSearchSettingsStore';
import {applySearchSettingsAction,searchSettingsModel} from '@/components/modal/settings/searchSettingsModel';

// test/unit/search/searchHistorySettings.test.ts
beforeEach(()=>{useSearchHistoryStore.setState({terms:{},recording:true});useSearchSettingsStore.setState({disabled:[],priority:'',sort:'relevance'});});
it('migrates aggregate, Qishui and extension history without allowing prototype keys',()=>{
    expect(sanitizeSearchHistory(JSON.parse(' {"aggregate":["a","A","b"],"qishui":["c"],"extension-one":["d"],"__proto__":["bad"]}'))).toEqual({aggregate:['a','b'],qishui:['c'],'extension-one':['d']});
});
it('disabling history preserves old records and clear only removes search terms',()=>{
    const store=useSearchHistoryStore.getState();store.remember('aggregate','old');store.setRecording(false);store.remember('qq','new');
    expect(useSearchHistoryStore.getState().terms).toEqual({aggregate:['old']});
    store.clearAll();expect(useSearchHistoryStore.getState()).toMatchObject({terms:{},recording:false});
});
it('source switches and priority use real shared configuration and reject invalid packets',()=>{
    applySearchSettingsAction('priority','qq');applySearchSettingsAction('source:qq','0');
    expect(useSearchSettingsStore.getState()).toMatchObject({disabled:['qq'],priority:''});
    applySearchSettingsAction('priority','qq');applySearchSettingsAction('source:__proto__','0');applySearchSettingsAction('sort','invalid');
    expect(useSearchSettingsStore.getState()).toMatchObject({disabled:['qq'],priority:'',sort:'relevance'});
    expect(searchSettingsModel().nodes.find(node=>node.id==='priority')?.options?.map(item=>item.value)).toEqual(['','netease','local']);
    applySearchSettingsAction('sort','local');applySearchSettingsAction('record','0');
    expect(useSearchSettingsStore.getState().sort).toBe('local');expect(useSearchHistoryStore.getState().recording).toBe(false);
});
it('bounds histories and ignores malformed runtime source keys',()=>{
    const store=useSearchHistoryStore.getState();store.remember('__proto__','bad');
    for(let index=0;index<40;index++)store.remember('qishui','query '+index);
    expect(useSearchHistoryStore.getState().terms.qishui).toHaveLength(20);
    expect(Object.hasOwn(useSearchHistoryStore.getState().terms,'__proto__')).toBe(false);
});
