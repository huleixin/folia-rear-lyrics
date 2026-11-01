// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {useNowPlayingSource} from '@/hooks/useNowPlayingSource';
import {LyricParserFactory} from '@/utils/lyrics/LyricParserFactory';

// test/unit/hooks/nowPlayingLifecycle.test.ts
const callbacks:any[]=[];
vi.mock('@/services/nowPlayingProvider',()=>({buildNowPlayingWsUrl:(v:string)=>v,NowPlayingProvider:class{
 constructor(cb:any){callbacks.push(cb)}start(){}stop(){}
}}));
vi.mock('@/utils/lyrics/LyricParserFactory',()=>({LyricParserFactory:{parse:vi.fn()}}));
vi.mock('@/utils/lyrics/nowPlayingSource',()=>({buildNowPlayingLyricSource:()=>({type:'local'})}));
afterEach(()=>{callbacks.length=0;vi.clearAllMocks()});
it('invalidates old parses on a same-name/different-id track and on host replacement',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(document.createElement('div'));let state:any,resolve!:(value:any)=>void;
 function Probe({host}:{host:string}){state=useNowPlayingSource({enabled:true,host}).state;return null}
 try{
  await act(()=>root.render(React.createElement(Probe,{host:'first'})));
  vi.mocked(LyricParserFactory.parse).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));
  await act(()=>{callbacks[0].onTrack({id:'a',title:'Same',artist:'Same'});callbacks[0].onLyric({title:'Same'})});
  await act(()=>callbacks[0].onTrack({id:'b',title:'Same',artist:'Same'}));
  await act(()=>resolve({lines:[{fullText:'OLD'}]}));expect(state.lyrics).toBeNull();
  vi.mocked(LyricParserFactory.parse).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));
  await act(()=>callbacks[0].onLyric({title:'Same'}));
  await act(()=>root.render(React.createElement(Probe,{host:'second'})));
  await act(()=>{resolve({lines:[{fullText:'OLD-HOST'}]});callbacks[0].onProgress({progressMs:99000})});
  expect(state.lyrics).toBeNull();expect(state.clock.positionSec).toBe(0);
 }finally{await act(()=>root.unmount())}
});
