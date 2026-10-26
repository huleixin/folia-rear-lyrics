import '../src/index';
import { usePlaybackStore } from '../src/stores/usePlaybackStore';
import { useAppViewStore } from '../src/stores/useAppViewStore';
import { useVisualizerSettingsStore } from '../src/stores/useVisualizerSettingsStore';
import { useAudioSettingsStore } from '../src/stores/useAudioSettingsStore';
import { useRearRuntimeStore } from '../src/stores/useRearRuntimeStore';
import { currentTime, lyricCurrentTime } from '../src/stores/motionSignals';
import { MAIN_STAGE_ACTIVITY_EVENT } from '../src/utils/stageActivity';
import { resolveAudioEqualizerSettings } from '../src/utils/audioEqualizer';
import { makeTone } from './probes/ordinaryPlaybackPower.probe';
import type { VisualizerMode, VisualizerFrameRate } from '../src/types';

// dev/dualStagePowerEntry.ts
// Additional QA build entry only. Never included in the APK build's HTML input list.
const w=window as Window & {__stagePowerQa?:unknown;__tingyuMainVisible?:boolean};
w.__stagePowerQa={
    seed() {
        const texts=['渐渐地忘记 赶不上明天','要用力地抓紧了想念','一路走来 记忆的路线'];
        const lines=texts.map((text,index)=>({fullText:text,startTime:index*2.5,endTime:index*2.5+2.4,
            words:[...text].map((text,i,a)=>({text,startTime:index*2.5+i*2.4/a.length,endTime:index*2.5+(i+1)*2.4/a.length}))}));
        useAudioSettingsStore.setState({audioEqualizerSettings:resolveAudioEqualizerSettings({enabled:false})});
        usePlaybackStore.setState({currentSong:{id:'stage-power',name:'双屏舞台验收',artists:[],album:{id:1,name:''},durationMs:8000},
            audioSrc:makeTone(),duration:8,playerState:'PAUSED' as never,lyrics:{lines},playQueue:[]});
        useVisualizerSettingsStore.setState({visualizerMode:'fume'});
    },
    view(view:'home'|'player') {useAppViewStore.setState({view});},
    mode(mode:VisualizerMode) {useVisualizerSettingsStore.getState().handleSetVisualizerMode(mode,{notify:false});},
    rate(rate:VisualizerFrameRate) {useVisualizerSettingsStore.getState().handleSetVisualizerFrameRate(rate);},
    mainActive(active:boolean) {w.__tingyuMainVisible=active;window.dispatchEvent(new Event(MAIN_STAGE_ACTIVITY_EVENT));},
    read() {return{time:currentTime.get(),lyricTime:lyricCurrentTime.get(),rear:useRearRuntimeStore.getState(),
        playing:usePlaybackStore.getState().playerState,view:useAppViewStore.getState().view,
        mode:useVisualizerSettingsStore.getState().visualizerMode};},
};
