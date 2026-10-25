import type { MutableRefObject } from 'react';
import { AUDIO_EQUALIZER_BANDS, type AudioEqualizerSettings } from '../utils/audioEqualizer';

// src/services/audioEqualizerGraph.ts
// Owns the Web Audio filter chain without introducing React updates into the audio path.

type ConnectAudioEqualizerGraphParams = {
    context: AudioContext;
    input: AudioNode;
    output: AudioNode;
    nodesRef: MutableRefObject<BiquadFilterNode[]>;
    settings: AudioEqualizerSettings;
};

const resolveFilterFrequency = (context: AudioContext, frequency: number) => (
    Math.min(frequency, context.sampleRate * 0.475)
);

// Allocates EQ only when non-flat EQ is requested; inactive filters are disconnected.
export const connectAudioEqualizerGraph = ({
    context,
    input,
    output,
    nodesRef,
    settings,
}: ConnectAudioEqualizerGraphParams) => {
    let nodes: BiquadFilterNode[] = [], connected = false;
    let bypassTimer: ReturnType<typeof setTimeout> | undefined;
    input.connect(output);
    const apply = (next: AudioEqualizerSettings) => {
        clearTimeout(bypassTimer); bypassTimer = undefined;
        // Flat/disabled EQ should be a wire, not ten nominally neutral DSP stages.
        const needed = next.enabled && next.gains.some(gain => gain !== 0);
        if (needed && nodes.length === 0) {
            nodes = AUDIO_EQUALIZER_BANDS.map((band, index) => {
                const filter = context.createBiquadFilter();
                filter.type = index === 0 ? 'lowshelf' : index === AUDIO_EQUALIZER_BANDS.length - 1 ? 'highshelf' : 'peaking';
                filter.frequency.value = resolveFilterFrequency(context, band.frequency);
                filter.Q.value = 1.4;
                filter.gain.value = 0;
                return filter;
            });
            nodesRef.current = nodes;
        }
        applyAudioEqualizerSettings(context, nodes, next);
        if (needed === connected) return;
        if (needed) {
            input.disconnect(output);
            nodes.reduce<AudioNode>((previous, node) => { previous.connect(node); return node; }, input).connect(output);
            connected = true;
        } else {
            // Let the 15ms gain smoothing settle before taking filters out of the live route.
            // A quick reversal cancels this one-shot; no timer survives the disabled steady state.
            bypassTimer = setTimeout(() => {
                input.disconnect(nodes[0]); nodes.forEach(node => node.disconnect());
                input.connect(output); connected = false; bypassTimer = undefined;
            }, 150);
        }
    };
    apply(settings);
    return { apply, dispose: () => {
        clearTimeout(bypassTimer);
        input.disconnect(connected ? nodes[0] : output);
        nodes.forEach(node => node.disconnect());
        nodesRef.current = [];
    } };
};

// Smoothly applies discrete slider commits while keeping React out of the audio processing loop.
export const applyAudioEqualizerSettings = (
    context: AudioContext,
    nodes: BiquadFilterNode[],
    settings: AudioEqualizerSettings,
) => {
    nodes.forEach((filter, index) => {
        const nextGain = settings.enabled ? (settings.gains[index] ?? 0) : 0;
        filter.gain.cancelScheduledValues(context.currentTime);
        filter.gain.setTargetAtTime(nextGain, context.currentTime, 0.015);
    });
};
