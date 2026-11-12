// Copyright (c) 2026 chthollyphile
import { defineVisualizerTuning } from '../tuningRegistry';
// src/components/visualizer/nebbia/tuning.ts
export default defineVisualizerTuning({
    mode: 'nebbia', settingsKey: 'nebbiaTuning', settingsSetterKey: 'handleSetNebbiaTuning',
    apply: (props, tuning) => ({ ...props, nebbiaTuning: tuning }),
});
