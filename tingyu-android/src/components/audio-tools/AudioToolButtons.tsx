import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
import { useAudioToolsStore, QUALITY_LABELS } from '../../stores/useAudioToolsStore';
import { openNativeToolPage } from '../../services/nativeMinimalTools';
import './audioTools.css';

// src/components/audio-tools/AudioToolButtons.tsx
//
// 第 11 轮：Android + Compose 桥可用时，音质/音效按钮开**原生工具页**（与极简页、舞台菜单
// 同一个目标）；否则回退原 WebView 弹窗。同一个功能只有一个 Android 原生目标页面。
export function QualityButton() {
    const quality = useAudioSettingsStore(state => state.audioQuality);
    return <button className="ty-quality-button" aria-label="音质切换" onClick={event => {
        event.stopPropagation();
        void openNativeToolPage('quality').then(handled => { if (!handled) useAudioToolsStore.getState().show(); });
    }}>{QUALITY_LABELS[quality]}</button>;
}
export default function AudioToolButtons() {
    return <div className="ty-audio-tools"><QualityButton/><button onClick={() => {
        void openNativeToolPage('effects').then(handled => { if (!handled) useAudioSettingsStore.getState().openAudioEqualizer(); });
    }}><SlidersHorizontal size={15}/>音效</button></div>;
}
