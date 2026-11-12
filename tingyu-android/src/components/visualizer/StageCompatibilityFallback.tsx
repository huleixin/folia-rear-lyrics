import React from 'react';
import {useTranslation} from 'react-i18next';
import type {Theme} from '../../types';
import type {RearRect} from '../../utils/rearCameraSafeArea';
import {resolveThemeFontStack,resolveThemeFontWeight} from '../../utils/fontStacks';
import RearFittedContent from './RearFittedContent';

// src/components/visualizer/StageCompatibilityFallback.tsx
// Retryable GPU fallback uses the same camera-safe text rectangle as the active stage.
export default function StageCompatibilityFallback({theme,text,fontScale,area,onRetry}: {theme:Theme;text?:string|null;fontScale:number;area?:RearRect;onRetry:()=>void}){
    const {t}=useTranslation();
    const content=<div className="text-center pointer-events-auto" style={{color:theme.primaryColor,
        fontFamily:resolveThemeFontStack(theme),fontWeight:resolveThemeFontWeight(theme,600),
        fontSize:area?Math.max(14,area.height*.16)*fontScale:'clamp(2rem, '+5.4*fontScale+'vw, 5.6rem)',overflowWrap:'anywhere'}}>
        <div>{text}</div><p className="mt-4 text-sm">{t('stageQuality.compatibilityFallback')}</p>
        <button className="mt-3 rounded-xl border px-4 py-2 text-sm" onClick={onRetry}>{t('stageQuality.retry')}</button>
    </div>;
    return area?<div className="absolute inset-0 z-30"><RearFittedContent area={area}>{content}</RearFittedContent></div>
        :<div className="absolute inset-0 z-30 flex items-center justify-center px-10">{content}</div>;
}
