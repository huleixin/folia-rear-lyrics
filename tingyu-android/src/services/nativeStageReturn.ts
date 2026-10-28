import {PREHIDE_COMPOSE_CHROME,chromeNative} from './nativeChrome';
import {useAppViewStore} from '../stores/useAppViewStore';
import {useSettingsModalStore} from '../stores/useSettingsModalStore';
import {setVisualizerRenderingSuspended} from '../utils/visualizerFrameChannel';

// src/services/nativeStageReturn.ts
// Both committed Android Back and the cover's collapse button take this one path.
let pending=false;
export function returnFromNativeStage(action:()=>void){
    if(!PREHIDE_COMPOSE_CHROME){action();return}
    if(pending)return;pending=true;
    // Retain the last canvas while native animates; do not render new shader/text frames under it.
    setVisualizerRenderingSuspended(true);
    let timer:ReturnType<typeof setTimeout>|undefined;
    const release=()=>{
        pending=false;clearTimeout(timer);unsubscribe();
        // A blocked/history-cancelled return must not leave the visible stage frozen.
        if(useAppViewStore.getState().view==='player')setVisualizerRenderingSuspended(false);
    };
    const unsubscribe=useAppViewStore.subscribe(state=>{if(state.view!=='player')release()});
    let timeout:ReturnType<typeof setTimeout>|undefined;
    void Promise.race([chromeNative.collapseStage().catch(()=>{}),new Promise<void>(resolve=>{timeout=setTimeout(resolve,900)})]).then(()=>{
        clearTimeout(timeout);
        if(useAppViewStore.getState().view==='player'&&!useSettingsModalStore.getState().settingsModalState.isOpen)action();
        else setVisualizerRenderingSuspended(false);
        timer=setTimeout(release,1000);
        if(useAppViewStore.getState().view!=='player')release();
    });
}
