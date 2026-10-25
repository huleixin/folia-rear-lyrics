import { describe, expect, it, vi } from 'vitest';
import { createAudioEffectChain } from '@/services/audioEffects/effectChain';
import { createNeutralAudioEffects } from '@/utils/audioEffects';
import { AUDIO_SOUND_PRESETS } from '@/utils/audioPresets';

// test/unit/services/audioEffectChain.test.ts
// Verifies the post-EQ effect chain stays neutral when idle and only allocates optional branches on demand.

const createParam = (value = 0) => ({
    value,
    cancelScheduledValues: vi.fn(),
    // Mirrors the scheduled target so assertions can read the requested value directly.
    setTargetAtTime: vi.fn(function (this: { value: number }, target: number) {
        this.value = target;
    }),
});

const createNode = <T extends object>(extra: T) => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    ...extra,
});

const createFakeContext = () => {
    const created = {
        convolvers: [] as unknown[],
        bufferSources: [] as Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }>,
        oscillators: [] as Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }>,
        gains: [] as Array<{ gain: ReturnType<typeof createParam>; disconnect: ReturnType<typeof vi.fn> }>,
    };

    const context = {
        sampleRate: 48_000,
        currentTime: 0,
        createBiquadFilter: () => createNode({ type: 'peaking', frequency: createParam(), Q: createParam() }),
        createWaveShaper: () => createNode({ curve: null as Float32Array | null, oversample: 'none' }),
        createDelay: () => createNode({ delayTime: createParam() }),
        createGain: () => {
            const node = createNode({ gain: createParam(1), channelCount: 2, channelCountMode: 'max', channelInterpretation: 'speakers' });
            created.gains.push(node);
            return node;
        },
        createChannelSplitter: () => createNode({}),
        createChannelMerger: () => createNode({}),
        createDynamicsCompressor: () => createNode({
            threshold: createParam(),
            knee: createParam(),
            ratio: createParam(),
            attack: createParam(),
            release: createParam(),
        }),
        createConvolver: () => {
            const node = createNode({ normalize: true, buffer: null as unknown });
            created.convolvers.push(node);
            return node;
        },
        createBufferSource: () => {
            const node = createNode({ buffer: null as unknown, loop: false, start: vi.fn(), stop: vi.fn() });
            created.bufferSources.push(node);
            return node;
        },
        createOscillator: () => {
            const node = createNode({ frequency: createParam(), start: vi.fn(), stop: vi.fn() });
            created.oscillators.push(node);
            return node;
        },
        createBuffer: (channels: number, length: number) => ({
            numberOfChannels: channels,
            getChannelData: () => new Float32Array(length),
        }),
    } as unknown as AudioContext;

    return { context, created };
};

const createChain = (effects = createNeutralAudioEffects(), enabled = true) => {
    const { context, created } = createFakeContext();
    const input = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
    const output = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
    const chain = createAudioEffectChain({ context, input, output, effects, enabled });
    return { chain, context, created, input, output };
};

describe('audio effect chain', () => {
    it('leaves the optional branches unallocated for a neutral chain', () => {
        const { created, input, output } = createChain();

        expect(created.convolvers).toHaveLength(0);
        expect(created.bufferSources).toHaveLength(0);
        expect(created.oscillators).toHaveLength(0);
        expect(input.connect).toHaveBeenCalledWith(output);
        expect(input.disconnect).not.toHaveBeenCalled();
        expect(created.gains).toHaveLength(0);
    });

    it('allocates reverb, noise and modulation only once the preset asks for them', () => {
        const { chain, created } = createChain();

        chain.apply(AUDIO_SOUND_PRESETS.lofi.effects, true);

        expect(created.convolvers).toHaveLength(1);
        expect(created.bufferSources).toHaveLength(1);
        expect(created.oscillators).toHaveLength(2);

        chain.apply(AUDIO_SOUND_PRESETS.lofi.effects, true);

        expect(created.convolvers).toHaveLength(1);
        expect(created.bufferSources).toHaveLength(1);
    });

    it('bypasses every effect while processing is disabled', () => {
        const { chain, created, input, output } = createChain();
        const expectedCross = (1 - AUDIO_SOUND_PRESETS.radio.effects.width) / 2;

        chain.apply(AUDIO_SOUND_PRESETS.radio.effects, true);
        expect(created.gains.some(node => node.gain.value === expectedCross)).toBe(true);

        chain.apply(AUDIO_SOUND_PRESETS.radio.effects, false);

        // Disabled processing now disconnects the entire chain instead of retaining neutral DSP.
        // Old nodes may keep their parameter values, but none of their output edges may survive.
        created.gains.forEach(node => expect(node.disconnect).toHaveBeenCalled());
        expect(input.connect).toHaveBeenCalledWith(output);
        expect(input.disconnect).toHaveBeenCalled();
    });

    it('allocates nothing when disabled and releases/recreates optional generators on demand', () => {
        const { chain, created, input, output } = createChain(AUDIO_SOUND_PRESETS.lofi.effects, false);
        expect(created.gains).toHaveLength(0);
        expect(created.bufferSources).toHaveLength(0);
        chain.apply(AUDIO_SOUND_PRESETS.lofi.effects, true);
        chain.apply(AUDIO_SOUND_PRESETS.lofi.effects, false);
        expect(created.bufferSources[0].stop).toHaveBeenCalledOnce();
        created.oscillators.forEach(node => expect(node.stop).toHaveBeenCalledOnce());
        expect(input.connect).toHaveBeenLastCalledWith(output);
        chain.apply(AUDIO_SOUND_PRESETS.lofi.effects, true);
        expect(created.bufferSources).toHaveLength(2);
        expect(created.oscillators).toHaveLength(4);
        chain.dispose();
        created.bufferSources.forEach(node => expect(node.stop).toHaveBeenCalledOnce());
        created.oscillators.forEach(node => expect(node.stop).toHaveBeenCalledOnce());
    });

    it('releases the noise source and oscillators on dispose', () => {
        const { chain, created } = createChain();

        chain.apply(AUDIO_SOUND_PRESETS.lofi.effects, true);
        chain.dispose();

        expect(created.bufferSources[0].stop).toHaveBeenCalled();
        created.oscillators.forEach(oscillator => expect(oscillator.stop).toHaveBeenCalled());
    });
});
