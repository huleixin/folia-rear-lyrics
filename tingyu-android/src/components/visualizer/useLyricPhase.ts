import { useLayoutEffect, useRef, useState } from 'react';
import { useMotionValueEvent, type MotionValue } from 'framer-motion';

// src/components/visualizer/useLyricPhase.ts
export type LyricPhase = 'waiting' | 'active' | 'passed';
export const lyricPhaseAt = (time:number,start:number,end:number):LyricPhase => time<start?'waiting':time>end?'passed':'active';
/** Re-entering a running stage must not replay already sung words from the hidden pose. */
export function useLyricPhase(time:MotionValue<number>,start:number,end:number):LyricPhase {
    const read = (value:number) => lyricPhaseAt(value,start,end);
    const [phase,setPhase]=useState<LyricPhase>(()=>read(time.get()));
    const phaseRef=useRef(phase);
    const update=(value:number)=>{const next=read(value);if(next!==phaseRef.current){phaseRef.current=next;setPhase(next)}};
    useMotionValueEvent(time,'change',update);
    useLayoutEffect(()=>update(time.get()),[time,start,end]);
    return phase;
}
