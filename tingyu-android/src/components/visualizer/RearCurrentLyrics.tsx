import React, { useMemo } from 'react';
import { motion, useTransform, type MotionValue } from 'framer-motion';
import type { Line, Theme } from '../../types';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../../utils/fontStacks';
import { buildLineGraphemeTimeline, type GraphemeTiming } from '../../utils/lyrics/graphemeTiming';
import type { RearRect } from '../../utils/rearCameraSafeArea';
import RearFittedContent from './RearFittedContent';
import { colorWithAlpha } from './colorMix';

// src/components/visualizer/RearCurrentLyrics.tsx
// Readable current lyrics above the full 3D scene, driven by the existing shared lyric clock.
function TimedChar({timing,currentTime,theme}:{timing:GraphemeTiming;currentTime:MotionValue<number>;theme:Theme}){
    const background=useTransform(currentTime,time=>{
        const progress=Math.max(0,Math.min(1,(time-timing.startTime)/Math.max(.001,timing.endTime-timing.startTime)))*100;
        return 'linear-gradient(to right, '+theme.primaryColor+' '+progress+'%, '+theme.secondaryColor+' '+progress+'%)';
    });
    return <motion.span style={{backgroundImage:background,backgroundClip:'text',WebkitBackgroundClip:'text',color:'transparent'}}>{timing.char}</motion.span>;
}

export default function RearCurrentLyrics({area,line,currentTime,theme,fontScale=1,background=true,children}: React.PropsWithChildren<{area:RearRect;line:Line|null;currentTime:MotionValue<number>;theme:Theme;fontScale?:number;background?:boolean}>){
    const timings=useMemo(()=>line?buildLineGraphemeTimeline(line):[],[line]);
    if(!line?.fullText)return null;
    return <RearFittedContent area={area}><div data-rear-current-lyrics style={{textAlign:'center',padding:4,lineHeight:1.3,
        fontFamily:resolveThemeFontStack(theme),fontWeight:resolveThemeFontWeight(theme,700),
        fontSize:Math.max(14,Math.min(area.height*.22,area.width*.095))*fontScale,
        whiteSpace:'pre-wrap',background:background?'radial-gradient(ellipse, '+colorWithAlpha(theme.backgroundColor,.8)+', transparent)':undefined}}>
        {timings.map((timing,index)=><TimedChar key={line.startTime+':'+index} timing={timing} currentTime={currentTime} theme={theme}/>)}
        {children}
    </div></RearFittedContent>;
}
