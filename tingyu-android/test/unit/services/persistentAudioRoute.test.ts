// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { getAudioCacheRoute, getPersistentAudioKey } from '@/services/onlineMusic/resourceKeys';
import { enabledLxScripts } from '@/services/lxSource/selection';
import { DEFAULT_LX_POLICY, useLxSourceStore } from '@/stores/useLxSourceStore';
import type { SongResult } from '@/types';

// Cache identity follows only the selected source chain and playback policy.
const old=useLxSourceStore.getState();
const scripts=['a','b','c'].map(id=>({id,name:id,code:id,version:'1',description:'',author:'',homepage:'',capabilities:{}}));
const song={id:'id',sourceRef:{kind:'online',providerId:'qq',mediaId:'id'}} as SongResult;
beforeEach(()=>useLxSourceStore.setState({scripts,activeId:'a',policy:{...DEFAULT_LX_POLICY,scriptOrder:['c','b']}}));
afterEach(()=>useLxSourceStore.setState(old));
it('does not enable imported backup scripts implicitly',()=>{
    expect(enabledLxScripts().map(s=>s.id)).toEqual(['a']);
    const initial=getAudioCacheRoute();
    useLxSourceStore.setState({scripts:scripts.map(s=>s.id==='b'?{...s,code:'changed disabled script'}:s)});
    expect(getAudioCacheRoute()).toBe(initial);
    useLxSourceStore.getState().setPolicy({scriptFallback:true});
    expect(enabledLxScripts().map(s=>s.id)).toEqual(['a','c','b']);
    expect(getAudioCacheRoute()).not.toBe(initial);
});
it('separates backup order, content, routing, providers and requested qualities',()=>{
    useLxSourceStore.getState().setPolicy({scriptFallback:true});const route=getAudioCacheRoute();
    useLxSourceStore.getState().setPolicy({scriptOrder:['b','c']});expect(getAudioCacheRoute()).not.toBe(route);
    const ordered=getAudioCacheRoute();useLxSourceStore.setState({scripts:scripts.map(s=>s.id==='b'?{...s,code:'new enabled script'}:s)});
    expect(getAudioCacheRoute()).not.toBe(ordered);
    const content=getAudioCacheRoute();useLxSourceStore.getState().setPolicy({routing:'original-first'});expect(getAudioCacheRoute()).not.toBe(content);
    expect(getPersistentAudioKey(song,'standard')).not.toBe(getPersistentAudioKey(song,'lossless'));
    const other={...song,sourceRef:{kind:'online',providerId:'netease',mediaId:'id'}} as SongResult;
    expect(getPersistentAudioKey(song,'standard')).not.toBe(getPersistentAudioKey(other,'standard'));
});
it('returns to the stable original-source route when scripts are disabled',()=>{
    useLxSourceStore.setState({activeId:null});const original=getAudioCacheRoute();
    useLxSourceStore.getState().setPolicy({scriptFallback:true,routing:'original-first'});expect(getAudioCacheRoute()).toBe(original);
});
