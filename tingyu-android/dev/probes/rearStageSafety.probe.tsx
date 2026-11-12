import React,{useMemo,useState} from 'react';
import {useMotionValue} from 'framer-motion';
import VisualizerRenderer from '../../src/components/visualizer/VisualizerRenderer';
import {DAYLIGHT_THEME,DEFAULT_THEME} from '../../src/services/baseThemes';
import {resolveRearReadingBox} from '../../src/utils/visualizerSurface';
import {DEFAULT_MACHI_TUNING} from '../../src/components/visualizer/machi/types';
import {DEFAULT_NEBBIA_TUNING} from '../../src/components/visualizer/nebbia/types';
import type {Line,VisualizerMode} from '../../src/types';
import type {ProbeDefinition} from './definition';

// Real full-scene rendering with the explicit reading rectangle used by rear live previews.
function Component(){
    const params=new URLSearchParams(location.search);
    const [mode,setMode]=useState<VisualizerMode>(params.get('mode')==='nebbia'?'nebbia':'machi');
    const [large,setLarge]=useState(false),[day,setDay]=useState(params.get('light')==='1');
    const time=useMotionValue(6),power=useMotionValue(0);
    const bands=useMemo(()=>({bass:power,lowMid:power,mid:power,vocal:power,treble:power}),[power]);
    const area=resolveRearReadingBox(innerWidth,innerHeight);
    const text=params.get('long')==='1'?'这是整句需要完整显示的歌词 HelloSuperLongUnbrokenWord 我们走过雨夜街景':'听见风吹过窗边';
    const charCount=Array.from(text).length;
    const lines=useMemo<Line[]>(()=>[{fullText:text,startTime:0,endTime:12,translation:'A complete translation that should wrap safely',romanization:'ting jian feng chui guo chuang bian',
        words:Array.from(text).map((text,index)=>({text,startTime:index*12/charCount,endTime:(index+1)*12/charCount})),
        ...(params.get('harmony')==='1'?{backgroundVocal:{text:'风吹过窗边的和声',translation:'Echo by the window',startTime:0,endTime:12,words:[]}}:{})}], [text,charCount]);
    return <><div data-testid="rear-scene" style={{position:'fixed',inset:0}}>
        <VisualizerRenderer mode={mode} currentTime={time} currentLineIndex={0} lines={lines} audioPower={power} audioBands={bands}
            theme={{...(day?DAYLIGHT_THEME:DEFAULT_THEME),fontFamily:large?'serif':'sans-serif',fontWeight:large?900:500}}
            subtitleTheme={{...(day?DAYLIGHT_THEME:DEFAULT_THEME),fontFamily:'monospace',fontWeight:600}}
            lyricsFontScale={large?3:1} subtitleFontScale={large?3:1} subtitleContentMode="both" showText paused
            rearSafeArea={area} isPreviewMode visualizerTunings={{machi:{...DEFAULT_MACHI_TUNING,scene:'station',weather:'clear'},nebbia:{...DEFAULT_NEBBIA_TUNING,behind:params.get('aquarium')==='1'?'aquarium':'night'}}}/>
    </div><div style={{position:'fixed',left:0,top:0,width:80,zIndex:100,display:'flex',flexDirection:'column',fontSize:10}}>
        <button onClick={()=>setMode(mode==='machi'?'nebbia':'machi')}>mode</button>
        <button onClick={()=>setLarge(v=>!v)}>font</button><button onClick={()=>setDay(v=>!v)}>theme</button>
        <button onClick={()=>time.set(time.get()===6?10:6)}>seek</button>
    </div></>;
}
export default {id:'rearStageSafety',title:'Rear stage safety',description:'Real 3D/glass stages and camera-safe text; no native device claim',Component} satisfies ProbeDefinition;
