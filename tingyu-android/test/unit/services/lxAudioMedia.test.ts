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
 it('registers the issued stream once without consuming or rejecting it in a tiny-range probe',async()=>{
  const request=vi.fn();vi.stubGlobal('fetch',request);
  expect(await prepareLxAudio('https://custom.example/song')).toBe(local);
  expect((window as any).Capacitor.Plugins.FoliaNative.registerRemoteAudio).toHaveBeenCalledWith({url:'https://custom.example/song',lxSource:true});
  expect(request).not.toHaveBeenCalled();
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
 it('keeps web URLs unchanged',async()=>{native.enabled=false;expect(await prepareLxAudio('https://custom.example/song')).toBe('https://custom.example/song');});
 it('retains a safe source explanation through classification and display',()=>{
  const error=new OnlineProviderError('unavailable','HTTP 404','lx-wy',undefined,undefined,undefined,{userMessage:'音源服务器返回 HTTP 404，没有可播放的音频'});
  const failure=classifyPlaybackError(error,{stage:'resolve-url',providerId:'lx-wy'});
  expect(failure.reason).not.toBe('taken-down');
  expect(getPlaybackFailureMessage(failure)).toEqual({key:'status.sourcePlaybackError',params:{detail:'音源服务器返回 HTTP 404，没有可播放的音频'}});
 });
});
