import React from 'react';
import {useTranslation} from 'react-i18next';
import type {VisualizerFrameRate} from '../../../types';
import {VISUALIZER_FRAME_RATE_OPTIONS} from '../../../utils/frameRateLimiter';

// src/components/modal/settings/SettingsFrameRateSlider.tsx
// The graphics page and rear profile share the same discrete FPS control.
export default function SettingsFrameRateSlider({value,disabled,onChange,className}:{
    value:VisualizerFrameRate;disabled:boolean;onChange:(value:VisualizerFrameRate)=>void;className:string;
}){
    const {t}=useTranslation();
    const selected=value==='off'?60:value;
    return <div className={`ty-frame-rate-slider space-y-3 ${disabled?'opacity-50':''}`} aria-disabled={disabled}>
        <div className="flex items-center justify-between gap-3 text-xs" style={{color:'var(--ty-settings-muted,var(--text-secondary))'}}>
            <span>{t('options.visualizerFrameRateValue')}</span><span className="font-mono">{selected} FPS</span>
        </div>
        <input type="range" min="0" max={VISUALIZER_FRAME_RATE_OPTIONS.length-1} step="1"
            value={Math.max(0,VISUALIZER_FRAME_RATE_OPTIONS.indexOf(selected))} disabled={disabled}
            onChange={e=>onChange(VISUALIZER_FRAME_RATE_OPTIONS[Number(e.target.value)])}
            className={className} aria-label={t('options.visualizerFrameRateValue')}/>
        <div className="flex justify-between text-[11px] font-mono" style={{color:'var(--ty-settings-muted,var(--text-secondary))'}}>
            {VISUALIZER_FRAME_RATE_OPTIONS.map(rate=><span key={rate}>{rate}</span>)}
        </div>
    </div>;
}
