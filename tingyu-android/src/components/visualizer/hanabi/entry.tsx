// Copyright (c) 2026 chthollyphile
import React from 'react';
import { defineVisualizer } from '../definition';
import { DEFAULT_HANABI_TUNING } from './types';
const VisualizerHanabi = React.lazy(() => import('./VisualizerHanabi'));
const HanabiSettingsPanel = React.lazy(() => import('./HanabiSettingsPanel'));
// src/components/visualizer/hanabi/entry.tsx
export default defineVisualizer({
    mode: 'hanabi', order: 26, labelKey: 'ui.visualizerHanabi', labelFallback: '花火',
    previewSeed: 'hanabi', previewStartOffset: 0, tuningKind: 'hanabi', usesWordSegmentation: true,
    render: props => <VisualizerHanabi {...props} hanabiTuning={props.hanabiTuning} />,
    renderSettingsPanel: props => <React.Suspense fallback={null}><HanabiSettingsPanel {...props} /></React.Suspense>,
    resetSettings: ({ resetHanabiTuning, setDraftHanabiTuning }) => {
        setDraftHanabiTuning?.(DEFAULT_HANABI_TUNING);
        if (resetHanabiTuning) resetHanabiTuning();
        else void import('../../../stores/useVisualizerSettingsStore').then(module => module.useVisualizerSettingsStore.getState().handleResetHanabiTuning());
    },
});
