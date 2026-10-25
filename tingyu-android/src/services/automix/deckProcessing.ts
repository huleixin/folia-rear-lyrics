import type { AutomixToneStack, AutomixThrow } from './crossfadeGraph';
import { createDeckAnalyser } from './deckAnalyser';
import { TONE_EDGE_HZ, TONE_MID_HZ } from './signalAnalysis';

// src/services/automix/deckProcessing.ts
// Ordinary playback is trim -> fade. Only enabled mixing owns tone/echo and measurement branches.
export function createDeckProcessing(context: AudioContext, trim: GainNode, fade: GainNode,
    replayGain: GainNode, output: AudioNode, initialEnabled: boolean) {
    let enabled = false;
    let effects: { tone: AutomixToneStack; echo: AutomixThrow } | null = null;
    const analyser = createDeckAnalyser(context, replayGain, output, false);
    trim.connect(fade);
    const ensure = () => {
        if (effects) return effects;
        const band = (type: BiquadFilterType, frequency: number, q?: number) => {
            const node = context.createBiquadFilter(); node.type = type;
            node.frequency.value = frequency; node.gain.value = 0;
            if (q !== undefined) node.Q.value = q;
            return node;
        };
        const tone = { low: band('lowshelf', TONE_EDGE_HZ[0]), mid: band('peaking', TONE_MID_HZ, .8), high: band('highshelf', TONE_EDGE_HZ[1]) };
        const send = context.createGain(); send.gain.value = 0;
        const delay = context.createDelay(2); delay.delayTime.value = .25;
        const feedback = context.createGain(); feedback.gain.value = .45;
        effects = { tone, echo: { send, delay, feedback } };
        return effects;
    };
    const setEnabled = (next: boolean) => {
        if (next === enabled) return;
        if (next) {
            const { tone, echo } = ensure();
            trim.disconnect(fade);
            trim.connect(tone.low).connect(tone.mid).connect(tone.high).connect(fade);
            tone.high.connect(echo.send).connect(echo.delay).connect(output);
            echo.delay.connect(echo.feedback).connect(echo.delay);
        } else if (effects) {
            trim.disconnect(effects.tone.low);
            Object.values(effects.tone).forEach(node => node.disconnect());
            Object.values(effects.echo).forEach(node => node.disconnect());
            // Discard the old delay buffer so re-enabling cannot resurrect an old echo tail.
            effects = null;
            trim.connect(fade);
        }
        analyser.setEnabled(next);
        enabled = next;
    };
    setEnabled(initialEnabled);
    return {
        get tone() { return ensure().tone; },
        get echo() { return ensure().echo; },
        analyser,
        setEnabled,
    };
}
