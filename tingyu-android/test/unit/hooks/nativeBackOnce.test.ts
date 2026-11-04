// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {useNativeBackButton} from '@/hooks/useNativeBackButton';

// test/unit/hooks/nativeBackOnce.test.ts
it('consumes each native back ID once while allowing the next physical Back immediately',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 let callback:((e:{eventId:number})=>void)|undefined;
 const navigate=vi.fn(()=>true),exit=vi.fn(async()=>{}),remove=vi.fn(async()=>{});
 (window as any).Capacitor={getPlatform:()=> 'android',Plugins:{FoliaNative:{exitApp:exit,addListener:async(_name:string,cb:typeof callback)=>{callback=cb;return{remove}}}}};
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Probe(){useNativeBackButton(navigate);return null;}
 try{
  await act(async()=>root.render(h(Probe)));
  callback?.({eventId:1});callback?.({eventId:1});expect(navigate).toHaveBeenCalledTimes(1);
  callback?.({eventId:2});expect(navigate).toHaveBeenCalledTimes(2);expect(exit).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());host.remove();delete (window as any).Capacitor;}
 expect(remove).toHaveBeenCalledTimes(1);
});
