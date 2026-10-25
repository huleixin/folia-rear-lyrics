import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectAudioEqualizerGraph } from '@/services/audioEqualizerGraph';
import { buildPlaybackGraph } from '@/services/playbackGraph';
import { createDeckProcessing } from '@/services/automix/deckProcessing';
import { resolveAudioEqualizerSettings } from '@/utils/audioEqualizer';

// test/unit/services/audioPowerGraph.test.ts
// Keep a live edge set (including disconnects), so bypass tests cannot pass on a nominal zero gain.
function recorder() {
    type Node = { kind: string; connect: (to: Node) => Node; disconnect: (to?: Node) => void };
    const nodes: Node[] = [], edges = new Map<Node, Set<Node>>();
    const param = (value=0) => ({value,cancelScheduledValues() {},setTargetAtTime(next:number) {this.value=next;}});
    const node = (kind:string,extra:object={}) => {
        const n = {kind,connect(to:Node) {edges.get(n)!.add(to);return to;},
            disconnect(to?:Node) {if(to) edges.get(n)!.delete(to); else edges.get(n)!.clear();},...extra};
        nodes.push(n);edges.set(n,new Set());return n;
    };
    const context = {sampleRate:48000,currentTime:0,destination:node('destination'),
        createGain:()=>node('gain',{gain:param(1)}),
        createBiquadFilter:()=>node('biquad',{gain:param(),frequency:param(),Q:param()}),
        createDelay:()=>node('delay',{delayTime:param()}),
        createAnalyser:()=>node('analyser',{fftSize:1024,frequencyBinCount:512,
            getFloatFrequencyData:(buffer:Float32Array)=>buffer.fill(-100),getFloatTimeDomainData:(buffer:Float32Array)=>buffer.fill(0)}),
        createWaveShaper:()=>node('shaper'),createChannelSplitter:()=>node('splitter'),createChannelMerger:()=>node('merger'),
        createDynamicsCompressor:()=>node('compressor',{threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()}),
    };
    const reachable = (root:unknown) => {
        const seen=new Set<Node>();const visit=(n:Node)=>{if(seen.has(n))return;seen.add(n);edges.get(n)?.forEach(visit);};
        visit(root as Node);return [...seen];
    };
    return {context:context as unknown as AudioContext,nodes,reachable,edges};
}
afterEach(()=>vi.useRealTimers());
const flat=resolveAudioEqualizerSettings({enabled:false});
const boosted=resolveAudioEqualizerSettings({enabled:true,gains:[0,0,0,6,0,0,0,0,0,0]});

describe('ordinary playback DSP demand',()=>{
    it('allocates no EQ at startup and removes all ten filters when disabled or flat',()=>{
        vi.useFakeTimers();
        const r=recorder(),input=r.context.createGain(),output=r.context.destination,ref={current:[] as BiquadFilterNode[]};
        const eq=connectAudioEqualizerGraph({context:r.context,input,output,nodesRef:ref,settings:flat});
        expect(ref.current).toHaveLength(0);expect(r.reachable(input).map(n=>n.kind)).toEqual(['gain','destination']);
        for(let i=0;i<20;i++) {
            eq.apply(boosted);expect(r.reachable(input).filter(n=>n.kind==='biquad')).toHaveLength(10);
            eq.apply(flat);vi.advanceTimersByTime(150);expect(r.reachable(input).map(n=>n.kind)).toEqual(['gain','destination']);
            eq.apply({...flat,enabled:true});expect(r.reachable(input).filter(n=>n.kind==='biquad')).toHaveLength(0);
        }
        expect(r.nodes.filter(n=>n.kind==='biquad')).toHaveLength(10);
        eq.dispose();expect(r.reachable(input)).toHaveLength(1);expect(ref.current).toHaveLength(0);
    });
    it('cancels a pending EQ bypass when re-enabled and clears pending work on disposal',()=>{
        vi.useFakeTimers();
        const r=recorder(),input=r.context.createGain(),ref={current:[] as BiquadFilterNode[]};
        const eq=connectAudioEqualizerGraph({context:r.context,input,output:r.context.destination,nodesRef:ref,settings:boosted});
        eq.apply(flat);vi.advanceTimersByTime(75);eq.apply(boosted);vi.advanceTimersByTime(200);
        expect(r.reachable(input).filter(n=>n.kind==='biquad')).toHaveLength(10);
        expect(r.edges.get(input as never)?.size).toBe(1);
        expect(vi.getTimerCount()).toBe(0);
        eq.apply(flat);eq.dispose();vi.advanceTimersByTime(200);
        expect(r.reachable(input)).toHaveLength(1);expect(vi.getTimerCount()).toBe(0);
    });
    it('does not allocate mixing DSP or FFT buffers until enabled and disconnects the echo feedback loop',()=>{
        const r=recorder(),trim=r.context.createGain(),fade=r.context.createGain(),replay=r.context.createGain();
        replay.connect(trim);fade.connect(r.context.destination);
        const mix=createDeckProcessing(r.context,trim,fade,replay,r.context.destination,false);
        expect(r.nodes.filter(n=>['biquad','analyser','delay'].includes(n.kind))).toHaveLength(0);
        expect(mix.analyser.tempo()).toBeNull();expect(mix.analyser.levelHistory()).toBeNull();
        for(let i=0;i<10;i++) {
            mix.setEnabled(true);mix.analyser.tick(1);
            expect(r.reachable(replay).filter(n=>n.kind==='biquad')).toHaveLength(5);
            expect(r.reachable(replay).filter(n=>n.kind==='analyser')).toHaveLength(1);
            expect(r.reachable(replay).filter(n=>n.kind==='delay')).toHaveLength(1);
            mix.setEnabled(false);
            expect(r.reachable(replay).every(n=>['gain','destination'].includes(n.kind))).toBe(true);
            expect(mix.analyser.levelHistory()).toBeNull();
            for(const n of r.nodes.filter(n=>n.kind==='delay'))expect(r.edges.get(n)?.size).toBe(0);
        }
    });
    it('bypasses visual FFT independently of volume, transport fade, EQ and music output',()=>{
        vi.useFakeTimers();
        const r=recorder(),analyser=r.context.createAnalyser(),input=r.context.createGain();
        const graph=buildPlaybackGraph({context:r.context,analyser,analysisEnabled:false,
            connectDecks:(_,output)=>{input.connect(output);return true;},equalizerNodesRef:{current:[]},settings:flat});
        for(let i=0;i<20;i++)for(const enabled of [true,false]) {
            graph.setAnalysisEnabled(enabled);graph.setAnalysisEnabled(enabled);
            const path=r.reachable(input);
            expect(path.some(n=>n.kind==='analyser')).toBe(enabled);
            expect(path).toContain(r.context.destination);expect(path).toContain(graph.fadeNode);expect(path).toContain(graph.gainNode);
            expect(r.edges.get(graph.fadeNode as never)?.size).toBe(1);
        }
        graph.equalizer.apply(boosted);expect(r.reachable(input).filter(n=>n.kind==='biquad')).toHaveLength(10);
        graph.equalizer.apply(flat);vi.advanceTimersByTime(150);expect(r.reachable(input).filter(n=>n.kind==='biquad')).toHaveLength(0);
        graph.dispose();expect(r.reachable(input)).not.toContain(r.context.destination);
    });
});
