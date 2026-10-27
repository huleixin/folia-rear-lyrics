import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareLxAudio } from '../../../src/services/lxSource/media';
import { proxyNativeRemoteAudioUrl } from '../../../src/services/nativeRemoteAudio';
import { OnlineProviderError } from '../../../src/types/onlineMusic';
import { classifyPlaybackError } from '../../../src/services/playbackRecovery/onlinePlaybackFailure';
import { getPlaybackFailureMessage } from '../../../src/services/playbackRecovery/playbackFailurePolicy';

// test/unit/services/lxAudioMedia.test.ts
const {native} = vi.hoisted(()=>({native:{enabled:true}}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>native.enabled}}));
const local='http://127.0.0.1:12345/remote-audio/lx-test';
beforeEach(()=>{native.enabled=true;vi.stubGlobal('window',{Capacitor:{Plugins:{FoliaNative:{registerRemoteAudio:vi.fn(async()=>({url:local}))}}}});});
afterEach(()=>vi.unstubAllGlobals());
describe('custom-source audio forwarding',()=>{
 it('opts into LX forwarding and verifies only the first byte',async()=>{
  const request=vi.fn(async(_url: string,_options: RequestInit)=>new Response(new Uint8Array([73]),{status:206,headers:{'content-type':'audio/mpeg'}}));vi.stubGlobal('fetch',request);
  expect(await prepareLxAudio('https://custom.example/song')).toBe(local);
  expect((window as any).Capacitor.Plugins.FoliaNative.registerRemoteAudio).toHaveBeenCalledWith({url:'https://custom.example/song',lxSource:true});
  expect((request.mock.calls[0][1].headers as Record<string,string>).Range).toBe('bytes=0-0');
 });
 it('does not silently fall back to a cross-origin URL after LX proxy rejection',async()=>{
  (window as any).Capacitor.Plugins.FoliaNative.registerRemoteAudio.mockRejectedValue(Error('Unsupported remote audio host'));
  await expect(prepareLxAudio('https://custom.example/song')).rejects.toThrow('Unsupported remote audio host');
  expect(await proxyNativeRemoteAudioUrl('https://built-in.example/song')).toBe('https://built-in.example/song');
 });
 it('rejects a bridge returning a direct remote URL',async()=>{
  (window as any).Capacitor.Plugins.FoliaNative.registerRemoteAudio.mockResolvedValue({url:'https://custom.example/song'});
  await expect(prepareLxAudio('https://custom.example/song')).rejects.toThrow('转发失败');
 });
 it('reports the actual upstream HTTP failure before media decoding',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:502,headers:{'X-Tingyu-Upstream-Status':'404'}})));
  await expect(prepareLxAudio('https://custom.example/song')).rejects.toThrow('HTTP 404');
 });
 it('rejects HTML or JSON advertised as successful audio',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html>error</html>',{headers:{'content-type':'text/html'}})));
  await expect(prepareLxAudio('https://custom.example/song')).rejects.toThrow('没有返回音频');
 });
 it('rejects empty audio',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(0),{headers:{'content-type':'audio/mpeg'}})));
  await expect(prepareLxAudio('https://custom.example/song')).rejects.toThrow('空音频');
 });
 it('keeps web URLs unchanged',async()=>{native.enabled=false;expect(await prepareLxAudio('https://custom.example/song')).toBe('https://custom.example/song');});
 it('retains a safe source explanation through classification and display',()=>{
  const error=new OnlineProviderError('unavailable','HTTP 404','lx-wy',undefined,undefined,undefined,{userMessage:'音源服务器返回 HTTP 404，没有可播放的音频'});
  const failure=classifyPlaybackError(error,{stage:'resolve-url',providerId:'lx-wy'});
  expect(failure.reason).not.toBe('taken-down');
  expect(getPlaybackFailureMessage(failure)).toEqual({key:'status.sourcePlaybackError',params:{detail:'音源服务器返回 HTTP 404，没有可播放的音频'}});
 });
});
