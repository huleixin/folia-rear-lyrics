import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
import { useAudioToolsStore, QUALITY_LABELS } from '../../stores/useAudioToolsStore';
import './audioTools.css';

// src/components/audio-tools/AudioToolButtons.tsx
export function QualityButton() {
    const quality = useAudioSettingsStore(state => state.audioQuality);
    return <button className="ty-quality-button" aria-label="音质切换" onClick={event => { event.stopPropagation(); useAudioToolsStore.getState().show(); }}>{QUALITY_LABELS[quality]}</button>;
}
export default function AudioToolButtons() {
    return <div className="ty-audio-tools"><QualityButton/><button onClick={() => useAudioSettingsStore.getState().openAudioEqualizer()}><SlidersHorizontal size={15}/>音效</button></div>;
}
