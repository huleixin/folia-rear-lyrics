// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it} from 'vitest';
import {useLxSourceStore,DEFAULT_LX_POLICY} from '@/stores/useLxSourceStore';
import {getSongResourceCacheKey} from '@/services/onlineMusic/resourceKeys';
import type {SongResult} from '@/types';

// test/unit/services/lxSourceStore.test.ts
const previous=useLxSourceStore.getState();
const script=(id:string,code:string)=>({id,code,name:'Fixture',version:code,author:'Tests',description:'',homepage:'',capabilities:{tx:{name:'QQ',qualitys:['128k'] as const as ['128k']}}});
beforeEach(()=>{localStorage.clear();useLxSourceStore.setState({scripts:[],activeId:null,revision:0,policy:DEFAULT_LX_POLICY});});
afterEach(()=>useLxSourceStore.setState(previous));
it('replaces a same-name source in place with one bounded rollback snapshot',()=>{
    const state=useLxSourceStore.getState();state.save(script('original','v1'));state.activate('original');
    expect(state.save(script('incoming','v2'))).toBe('original');
    expect(useLxSourceStore.getState().scripts).toHaveLength(1);expect(useLxSourceStore.getState().activeId).toBe('original');
    state.save(script('third','v3'));expect(useLxSourceStore.getState().scripts[0].previous).toMatchObject({code:'v2',previous:undefined});
    state.rollback('original');expect(useLxSourceStore.getState().scripts[0].code).toBe('v2');expect(useLxSourceStore.getState().scripts[0].previous).toBeUndefined();
});
it('invalidates audio caches when the same source is updated without affecting local file keys',()=>{
    const state=useLxSourceStore.getState(),song={id:1,sourceRef:{kind:'online',providerId:'qq',mediaId:'1'}} as SongResult,local={id:1,sourceRef:{kind:'local',mediaId:'1'}} as SongResult;
    state.save(script('a','v1'));state.activate('a');const first=getSongResourceCacheKey('audio',song),localKey=getSongResourceCacheKey('audio',local);
    state.save(script('b','v2'));expect(getSongResourceCacheKey('audio',song)).not.toBe(first);expect(getSongResourceCacheKey('audio',local)).toBe(localKey);
});
it('does not mutate installed state when storage rejects an update',()=>{
    const state=useLxSourceStore.getState();state.save(script('a','v1'));const old=useLxSourceStore.getState();
    const original=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('quota');};
    try{expect(()=>state.save(script('b','v2'))).toThrow('quota');expect(useLxSourceStore.getState()).toBe(old);}finally{Storage.prototype.setItem=original;}
});
it('bounds retry settings, persists policy and clears the active selection on deletion',()=>{
    const state=useLxSourceStore.getState();state.save(script('a','v1'));state.activate('a');state.setPolicy({retries:100,priority:['kw','kw','bad','tx'],preferredSource:'bad'});
    expect(useLxSourceStore.getState().policy).toMatchObject({retries:1,priority:['kw','tx'],preferredSource:null});state.remove('a');expect(useLxSourceStore.getState().activeId).toBeNull();
    expect(JSON.parse(localStorage.getItem('tingyu_lx_sources_v1')!).scripts).toEqual([]);
});
