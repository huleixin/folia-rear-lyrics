import { useEffect, useRef } from 'react';
import { GRAPHICS_DIAGNOSTICS } from '../utils/graphicsDiagnosticsBuild';
import { isMainAppSurface } from '../utils/appSurface';
import { graphicsStageMounted } from '../services/graphicsDiagnostics';
import type { VisualizerSharedProps } from '../components/visualizer/definition';

// src/hooks/useGraphicsStageProbe.ts
// Read continuous values only on an explicit, sparse diagnostic sample, never into React state.
export function useGraphicsStageProbe(mode:string,props:VisualizerSharedProps){
    const latest=useRef({mode,props});latest.current={mode,props};
    useEffect(()=>{
        if(!GRAPHICS_DIAGNOSTICS||!isMainAppSurface||latest.current.props.isPreviewMode)return;
        return graphicsStageMounted(()=>{const {mode,props}=latest.current;return {mode,seed:props.seed,line:props.currentLineIndex,
            paused:props.paused,staticMode:props.staticMode,clock:props.currentTime.get()}});
    },[]);
}
