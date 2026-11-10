import {beforeEach,it,expect,vi} from 'vitest';
import type {ObsBrowserSourceConfig} from '@/types/obsBrowserSource';
import {resolveRearStageConfig,validateRearAppearance} from '@/services/rearStageAppearance';
import {compressConfig,decompressConfig} from '@/utils/appearanceCodec';
const storage=vi.hoisted(()=>new Map<string,any>());
vi.mock('@/services/appDatabase',()=>({appDatabase:{appearance_profiles:{get:async(id:string)=>storage.get(id),put:async(value:any)=>{storage.set(value.id,structuredClone(value));}}}}));
const front=()=>({activePlaybackContext:'main',playbackSongKey:'qq:B',playbackSessionId:'n1',song:{id:'B',name:'B'},lyrics:{lines:[{fullText:'B'}]},hasTrack:true,seed:123,theme:{name:'Front',backgroundColor:'#123456',primaryColor:'#fff',secondaryColor:'#ccc',accentColor:'#00cc99',fontStyle:'sans',animationIntensity:'normal'},isDaylight:false,visualizerMode:'claddagh',visualizerTunings:{claddagh:{radiusScale:1}},background:{mode:'monet',customImage:{id:'image',name:'kept',url:'data:image/png;base64,front'}},lyricsFontScale:1,staticMode:false}) as unknown as ObsBrowserSourceConfig;
beforeEach(()=>{storage.clear();vi.resetModules();});
it('defaults to following front without changing the live config or song',async()=>{
    const {useRearStageAppearanceStore:s}=await import('@/stores/useRearStageAppearanceStore');await s.getState().initialize();
    const f=front();expect(resolveRearStageConfig(f,s.getState())).toBe(f);expect(s.getState().mode).toBe('follow');
});
it('first independent switch copies visuals/font bytes; front edits and clearing assets cannot mutate rear',async()=>{
    const {useRearStageAppearanceStore:s}=await import('@/stores/useRearStageAppearanceStore');const f=front();
    s.getState().observeFront(f,{id:'font',family:'uploaded',url:'data:font/ttf;base64,kept'});await s.getState().setMode('independent');
    f.theme.primaryColor='#111';f.background!.customImage=null;
    expect(s.getState().profile!.visual.theme.primaryColor).toBe('#fff');expect(s.getState().profile!.visual.background!.customImage!.id).toBe('image');expect(s.getState().profile!.font?.url).toContain('kept');
    s.getState().patch({lyricsFontScale:1.5});expect(f.lyricsFontScale).toBe(1);
    const resolved=resolveRearStageConfig({...f,playbackSongKey:'qq:C',seed:999},s.getState());
    expect(resolved.lyricsFontScale).toBe(1.5);expect(resolved.playbackSongKey).toBe('qq:C');expect(resolved.seed).toBe(999);expect(resolved.lyrics).toBe(f.lyrics);
});
it('follow / independent / restart preserves the independent profile and shares it across backends',async()=>{
    let {useRearStageAppearanceStore:s}=await import('@/stores/useRearStageAppearanceStore');s.getState().observeFront(front(),null);await s.getState().setMode('independent');s.getState().patch({visualizerMode:'monet'});
    await s.getState().setMode('follow');expect(s.getState().profile!.visual.visualizerMode).toBe('monet');
    const changed=front();changed.visualizerMode='classic';s.getState().observeFront(changed,null);expect(resolveRearStageConfig(changed,s.getState()).visualizerMode).toBe('classic');
    await s.getState().setMode('independent');vi.resetModules();({useRearStageAppearanceStore:s}=await import('@/stores/useRearStageAppearanceStore'));await s.getState().initialize();
    expect(s.getState().mode).toBe('independent');expect(s.getState().profile!.visual.visualizerMode).toBe('monet');expect([...storage.keys()]).toEqual(['rear-stage']);
});
it('shortcode roundtrip includes rear visuals and strips imported playback fields',async()=>{
    const {useRearStageAppearanceStore:s,exportRearAppearance}=await import('@/stores/useRearStageAppearanceStore');s.getState().observeFront(front(),null);await s.getState().setMode('independent');
    const data=decompressConfig(compressConfig({rearStageAppearance:exportRearAppearance()}));expect(data.rearStageAppearance.mode).toBe('independent');
    data.rearStageAppearance.profile.visual.playbackSongKey='wrong';data.rearStageAppearance.profile.visual.lyrics={lines:[]};
    await s.getState().restore(data.rearStageAppearance);expect(resolveRearStageConfig(front(),s.getState()).playbackSongKey).toBe('qq:B');expect(s.getState().profile!.visual).not.toHaveProperty('lyrics');
    expect(()=>validateRearAppearance({version:1,mode:'independent',profile:null})).toThrow();
});
it('existing editor callbacks write only the rear profile including tuning, background and subtitles',async()=>{
    const {useRearStageAppearanceStore:s}=await import('@/stores/useRearStageAppearanceStore');s.getState().observeFront(front(),null);await s.getState().setMode('independent');
    const {rearStageEditorProps}=await import('@/components/modal/settings/rearStageEditorProps');const props=rearStageEditorProps(s.getState().profile!.visual,()=>{});
    props.onFontScaleChange(1.7);props.onCladdaghTuningChange!({radiusScale:1.2} as any);props.onSubtitleFontFamilyChange!('RearSubtitle');props.backgroundActions!.common!.onOpacityChange!(.4);
    expect(s.getState().profile!.visual.lyricsFontScale).toBe(1.7);expect(s.getState().profile!.visual.subtitleTheme!.fontFamily).toBe('RearSubtitle');expect(s.getState().profile!.visual.background!.common!.opacity).toBe(.4);expect(front().lyricsFontScale).toBe(1);
});
it('rear light/dark palettes remain independent and survive a follow roundtrip',async()=>{
    const {useRearStageAppearanceStore:s}=await import('@/stores/useRearStageAppearanceStore');s.getState().observeFront(front(),null);await s.getState().setMode('independent');
    const base=front().theme;s.getState().patch({},undefined,{light:{...base,name:'Rear day'},dark:{...base,name:'Rear night'}});
    expect(s.getState().profile!.visual.theme.name).toBe('Rear night');s.getState().patch({isDaylight:true});expect(s.getState().profile!.visual.theme.name).toBe('Rear day');
    await s.getState().setMode('follow');await s.getState().setMode('independent');expect(s.getState().profile!.visual.theme.name).toBe('Rear day');
});

it('roundtrips independent random rules through the existing rear appearance shortcode',async()=>{
    const {useRearStageAppearanceStore:s,exportRearAppearance}=await import('@/stores/useRearStageAppearanceStore');
    s.getState().observeFront(front(),null);await s.getState().setMode('independent');
    s.getState().patch({randomVisualizer:{enabled:true,modes:['classic','hanabi'],seed:'rear-session',initialSongKey:'qq:B'}});
    const backup=decompressConfig(compressConfig({rearStageAppearance:exportRearAppearance()}));
    await s.getState().restore(backup.rearStageAppearance);
    expect(s.getState().profile!.visual.randomVisualizer).toEqual({enabled:true,modes:['classic','hanabi'],seed:'rear-session',initialSongKey:'qq:B'});
});
