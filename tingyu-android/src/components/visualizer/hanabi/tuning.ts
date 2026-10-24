// Copyright (c) 2026 chthollyphile
import { defineVisualizerTuning } from '../tuningRegistry';
// src/components/visualizer/hanabi/tuning.ts
export default defineVisualizerTuning({
    mode: 'hanabi', settingsKey: 'hanabiTuning', settingsSetterKey: 'handleSetHanabiTuning',
    apply: (props, tuning) => ({ ...props, hanabiTuning: tuning }),
});
