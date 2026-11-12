// Copyright (c) 2026 chthollyphile
import { defineVisualizerTuning } from '../tuningRegistry';
// src/components/visualizer/machi/tuning.ts
export default defineVisualizerTuning({
    mode: 'machi', settingsKey: 'machiTuning', settingsSetterKey: 'handleSetMachiTuning',
    apply: (props, tuning) => ({ ...props, machiTuning: tuning }),
});
