import React, { useLayoutEffect, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import VisualizerSubtitleOverlay from '../../src/components/visualizer/VisualizerSubtitleOverlay';
import { PlayerBottomBarLayoutContext } from '../../src/components/floating-player/PlayerBottomBarLayoutContext';
import { resolveNativeStageSubtitleBottom } from '../../src/components/app/overlays/mobile-stage/useNativeStageSubtitleBottom';
import { nativeLandscapeSubtitleBottom } from '../../src/utils/mobileStageSubtitleClearance';
import { DEFAULT_THEME } from '../../src/services/baseThemes';
import type { ProbeDefinition } from './definition';

// dev/probes/nativeLandscapeSubtitle.probe.tsx
// Render the real shared subtitle. Only the native control geometry/event is simulated.
function NativeLandscapeSubtitleProbe() {
    const [shown,setShown]=useState(true);
    const [ready,setReady]=useState(false);
    const presence=useMotionValue(1);
    const controlY=useTransform(presence,value=>106*(1-value));
    const rear=new URLSearchParams(location.search).get('surface')==='rear';
    useLayoutEffect(()=>{
        if(rear)document.documentElement.dataset.foliaSurface='rear-lyrics-panel';
        setReady(true);
        return()=>{delete document.documentElement.dataset.foliaSurface};
    },[rear]);
    useLayoutEffect(()=>{
        const publish=()=>nativeLandscapeSubtitleBottom.set(resolveNativeStageSubtitleBottom({
            active:true,width:window.innerWidth,height:window.innerHeight,safeBottom:0,
            shown,shownBottom:110,hiddenBottom:4,durationMs:240,
        },presence.get(),window.innerWidth));
        const unsubscribe=presence.on('change',publish);publish();
        const animation=animate(presence,shown?1:0,{duration:.24,ease:[.4,0,.2,1]});
        window.addEventListener('resize',publish);
        return()=>{animation.stop();unsubscribe();window.removeEventListener('resize',publish);nativeLandscapeSubtitleBottom.set(-1)};
    },[shown,presence,rear]);
    return <div data-testid="subtitle-stage" style={{position:'fixed',inset:0,overflow:'hidden',background:'#aea398',color:'#242421'}}>
        <button data-testid="toggle-controls" onClick={()=>setShown(value=>!value)} style={{position:'absolute',top:16,left:24,zIndex:30}}>显示 / 收起控件</button>
        <div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',fontSize:64,opacity:.5}}>对你心跳的感应</div>
        <PlayerBottomBarLayoutContext.Provider value={!rear}>
            {ready&&<VisualizerSubtitleOverlay showText activeLine={{startTime:0,endTime:10,fullText:'当前歌词',words:[]}}
                recentCompletedLine={null} nextLines={[
                    {startTime:10,endTime:20,fullText:'还是如此温情亲近',words:[]},
                    {startTime:20,endTime:30,fullText:'怀念你那鲜红的唇印',words:[]},
                ]} theme={{...DEFAULT_THEME,secondaryColor:'#292623'}} translationFontSize="16px" upcomingFontSize="16px"
                subtitleOverlayBackground={false} subtitleUpcomingLyricsBlur={false} />}
        </PlayerBottomBarLayoutContext.Provider>
        {!rear&&<motion.div data-testid="simulated-controls" style={{position:'absolute',bottom:10,left:'calc(50% - 215px)',width:430,height:96,
            borderRadius:30,background:'#e7e9e3',display:'grid',placeItems:'center',y:controlY}}>上一首　　播放 / 暂停　　下一首</motion.div>}
    </div>;
}

export default {id:'nativeLandscapeSubtitle',title:'正屏横屏字幕贴底',description:'真实字幕组件与模拟原生几何；展开、收起、旋转及独立背屏布局。',Component:NativeLandscapeSubtitleProbe} satisfies ProbeDefinition;
