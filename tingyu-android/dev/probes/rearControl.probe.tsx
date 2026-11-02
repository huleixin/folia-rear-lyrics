import {useRearStageAppearanceStore,exportRearAppearance} from '../../src/stores/useRearStageAppearanceStore';
import React from 'react';
import MobileSettingsLanding from '../../src/components/modal/settings/MobileSettingsLanding';
import {useSettingsModalStore} from '../../src/stores/useSettingsModalStore';
import {useThemeSettingsStore} from '../../src/stores/useThemeSettingsStore';
import {lightInterfaceTokens} from '../../src/services/interfaceAppearance';
import type {RearLyricsStatus} from '../../src/services/rearLyricsControl';
import i18n from '../../src/i18n/config';
import type {ProbeDefinition} from './definition';

// dev/probes/rearControl.probe.tsx
// Real landing/controller/view, deterministic native boundary only. Never included in Release.
const Component=()=>{
    const [ready,setReady]=React.useState(false);
    React.useLayoutEffect(()=>{
        const surface=window as any,previous=surface.Capacitor;surface.__rearAppearance=exportRearAppearance;
        let status:RearLyricsStatus={backendMode:'lsp',lspConnected:true,enabled:false,active:false,starting:false,shizukuAvailable:true,authorized:true,rearDisplayId:1,build:250,controlEngine:'plan-a',lockedRoute:'auto',sensorAvailable:true,coverSleepEnabled:false,diagnostics:'fixture: native status boundary',sleepDiagnostics:'fixture: sensor available'};
        useRearStageAppearanceStore.getState().observeFront({activePlaybackContext:'main',hasTrack:true,song:{id:'current',name:'Current'},lyrics:{lines:[]},theme:{name:'Front',backgroundColor:'#08251d',primaryColor:'#e8f4ed',secondaryColor:'#91b5a4',accentColor:'#74d9ba',fontStyle:'sans',animationIntensity:'normal'},isDaylight:false,visualizerMode:'claddagh',lyricsFontScale:1,subtitleFontScale:1,visualizerOpacity:1,subtitleOverlayOpacity:1,staticMode:false,hideTranslationSubtitle:false,seed:1,updatedAt:Date.now(),stageSource:null,songArtist:null,songAlbum:null,coverUrl:null},null);
        const calls:string[]=[];surface.__rearCalls=calls;surface.__rearExports=[];
        const native={getRearLyricsStatus:async()=>({...status}),startRearLyrics:async()=>{calls.push('start');status={...status,enabled:true,active:true};return{verified:true};},
            returnFromRearLyrics:async()=>{calls.push('stop');status={...status,enabled:false,active:false};},
            setRearLyricsBackend:async({mode}:any)=>{calls.push('backend:'+mode);status={...status,backendMode:mode};},
            setRearControlEngine:async({engine}:any)=>{calls.push('engine:'+engine);status={...status,controlEngine:engine};return{engine};},
            setRearLockedRoute:async({mode}:any)=>{calls.push('route:'+mode);status={...status,lockedRoute:mode};return{lockedRoute:mode};},
            setRearCoverSleep:async({enabled}:any)=>{calls.push('cover:'+enabled);status={...status,coverSleepEnabled:enabled};},
            shareTextFile:async(data:any)=>{surface.__rearExports.push(data);return{};}};
        surface.Capacitor={...previous,getPlatform:()=> 'android',Plugins:{...previous?.Plugins,FoliaNative:native}};
        surface.__rearFixture=async(backend:'lsp'|'shizuku',light:boolean,patch:Partial<RearLyricsStatus>={})=>{
            status={...status,backendMode:backend,enabled:false,active:false,starting:false,sleeping:false,...patch};
            useThemeSettingsStore.setState({interfaceAppearance:light?'light':'dark'});
            document.documentElement.dataset.interfaceAppearance=light?'light':'dark';
            for(const [key,value]of Object.entries(lightInterfaceTokens)){if(light)document.documentElement.style.setProperty(key,value);else document.documentElement.style.removeProperty(key);}
            document.documentElement.style.setProperty('--text-primary',light?'#213e34':'#e8f4ed');
            document.dispatchEvent(new Event('visibilitychange'));
        };
        void i18n.changeLanguage('zh-CN');useSettingsModalStore.getState().openSettings('options');
        void surface.__rearFixture('lsp',false);setReady(true);
        return()=>{surface.Capacitor=previous;delete surface.__rearFixture;};
    },[]);
    return ready?<MobileSettingsLanding onClose={()=>{(window as any).__rearCalls.push('close')}}/>:null;
};
export default {id:'rearControl',title:'背屏控制中心',description:'真实设置页与控制器，LSP/Shizuku 原生边界模拟；非真机背屏验证',Component} satisfies ProbeDefinition;
