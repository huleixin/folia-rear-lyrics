import React, { lazy, Suspense } from 'react';
import type { Theme } from '../../types';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
import { useAudioToolsStore } from '../../stores/useAudioToolsStore';
const AudioEqualizerDialog = lazy(() => import('../panelTab/AudioEqualizerDialog'));
const QualityDialog = lazy(() => import('./QualityDialog'));
const LxSourceDialog = lazy(() => import('./LxSourceDialog'));
import { useLxSourceStore } from '../../stores/useLxSourceStore';
import './audioTools.css';

// src/components/audio-tools/AudioToolsHost.tsx
export default function AudioToolsHost({ theme, isDaylight }: { theme: Theme; isDaylight: boolean }) {
    const eq = useAudioSettingsStore(state => state.isAudioEqualizerOpen);
    const quality = useAudioToolsStore(state => state.open);
    const lx = useLxSourceStore(state => state.open);
    return <Suspense fallback={null}>{eq && <AudioEqualizerDialog theme={theme} isDaylight={isDaylight}/>}{quality && <QualityDialog isDaylight={isDaylight}/>}{lx && <LxSourceDialog isDaylight={isDaylight}/>}</Suspense>;
}
