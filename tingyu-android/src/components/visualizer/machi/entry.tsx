// Copyright (c) 2026 chthollyphile
import React from 'react';
import { defineVisualizer } from '../definition';
import { DEFAULT_MACHI_TUNING } from './types';
const VisualizerMachi = React.lazy(() => import('./VisualizerMachi'));
const MachiSettingsPanel = React.lazy(() => import('./MachiSettingsPanel'));
// src/components/visualizer/machi/entry.tsx
export default defineVisualizer({
    mode: 'machi', order: 28, labelKey: 'ui.visualizerMachi', labelFallback: '町景',
    previewSeed: 'machi', previewStartOffset: 0, tuningKind: 'machi', usesWordSegmentation: true,
    render: props => <VisualizerMachi {...props} machiTuning={props.machiTuning} />,
    renderSettingsPanel: props => <React.Suspense fallback={null}><MachiSettingsPanel {...props} /></React.Suspense>,
    resetSettings: ({ resetMachiTuning, setDraftMachiTuning }) => {
        setDraftMachiTuning?.(DEFAULT_MACHI_TUNING);
        if (resetMachiTuning) resetMachiTuning();
        else void import('../../../stores/useVisualizerSettingsStore').then(module => module.useVisualizerSettingsStore.getState().handleResetMachiTuning());
    },
});
