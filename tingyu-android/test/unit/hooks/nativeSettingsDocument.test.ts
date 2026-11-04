// @vitest-environment jsdom
import {act,createElement as h,useRef} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useNativeSettingsDocument} from '@/hooks/useNativeSettingsDocument';

// test/unit/hooks/nativeSettingsDocument.test.ts
const state=vi.hoisted(()=>({capture:vi.fn(),models:[] as any[]}));
vi.mock('@/services/nativePages',()=>({NATIVE_FIRST:true}));
vi.mock('@/hooks/useNativePage',()=>({useNativePage:(_ref:any,_id:any,_enabled:any,model:any,actions:any)=>{state.models.push({model,actions});}}));
vi.mock('@/services/nativeSettingsDocument',()=>({captureSettingsDocument:state.capture}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
function Probe({pageKey='options:playback'}:{pageKey?:string}){
 const ref=useRef<HTMLDivElement>(null);useNativeSettingsDocument(ref,true,pageKey,'Settings');
 return h('div',{ref},h('div',{'data-native-live':'true'},h('span',null,'live')),h('button',null,'setting'));
}
beforeEach(()=>{
 vi.useFakeTimers();vi.clearAllMocks();state.models=[];
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 Object.defineProperty(document,'fonts',{configurable:true,value:{ready:new Promise(()=>{})}});
 state.capture.mockImplementation(()=>({document:{paints:[{kind:'text',text:String(state.capture.mock.calls.length)}],controls:[],areas:[],live:[]},actions:{open:vi.fn()}}));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
it('ignores preview animation mutations and coalesces discrete form edits',async()=>{
 await act(async()=>root.render(h(Probe)));expect(state.capture).toHaveBeenCalledTimes(1);
 await act(async()=>{const live=host.querySelector('span')!;for(let i=0;i<500;i++){live.style.transform=`translateX(${i}px)`;live.textContent=String(i);}});
 await act(async()=>vi.advanceTimersByTimeAsync(100));expect(state.capture).toHaveBeenCalledTimes(1);
 await act(async()=>{const button=host.querySelector('button')!;for(let i=0;i<100;i++)button.textContent=String(i);});
 await act(async()=>vi.advanceTimersByTimeAsync(48));expect(state.capture).toHaveBeenCalledTimes(2);
});
it('publishes document identity and handlers together and refreshes retired controls',async()=>{
 await act(async()=>root.render(h(Probe)));const before=state.models.at(-1);
 await act(async()=>root.render(h(Probe,{pageKey:'options:visualizer'})));
 const after=state.models.at(-1);expect(after.model.key).toBe('settings:document:options:visualizer');
 expect(after.actions).not.toBe(before.actions);expect(after.model.document.paints[0].text).toBe('2');
 expect(host.firstElementChild?.getAttribute('data-native-settings-key')).toBe(after.model.key);
 document.dispatchEvent(new Event('tingyu-native-settings-refresh'));
 await act(async()=>vi.advanceTimersByTimeAsync(48));expect(state.capture).toHaveBeenCalledTimes(3);
 await act(async()=>root.unmount());
 expect(document.documentElement.dataset.nativeSettingsDocument).toBeUndefined();
});
