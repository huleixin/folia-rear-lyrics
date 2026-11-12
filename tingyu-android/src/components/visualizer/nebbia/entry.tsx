// Copyright (c) 2026 chthollyphile
import React from 'react';
import { defineVisualizer } from '../definition';
import { DEFAULT_NEBBIA_TUNING } from './types';
const VisualizerNebbia = React.lazy(() => import('./VisualizerNebbia'));
const NebbiaSettingsPanel = React.lazy(() => import('./NebbiaSettingsPanel'));
// src/components/visualizer/nebbia/entry.tsx
export default defineVisualizer({
    mode: 'nebbia', order: 27, labelKey: 'ui.visualizerNebbia', labelFallback: '雾笺',
    previewSeed: 'nebbia', previewStartOffset: 0, tuningKind: 'nebbia', usesWordSegmentation: true,
    render: props => <VisualizerNebbia {...props} nebbiaTuning={props.nebbiaTuning} />,
    renderSettingsPanel: props => <React.Suspense fallback={null}><NebbiaSettingsPanel {...props} /></React.Suspense>,
    resetSettings: ({ resetNebbiaTuning, setDraftNebbiaTuning }) => {
        setDraftNebbiaTuning?.(DEFAULT_NEBBIA_TUNING);
        if (resetNebbiaTuning) resetNebbiaTuning();
        else void import('../../../stores/useVisualizerSettingsStore').then(module => module.useVisualizerSettingsStore.getState().handleResetNebbiaTuning());
    },
});
