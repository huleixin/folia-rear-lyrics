import { connectAutomixDeck } from '../src/services/automix/crossfadeGraph';
import { buildPlaybackGraph } from '../src/services/playbackGraph';
import { resolveAudioEqualizerSettings } from '../src/utils/audioEqualizer';
import { AUDIO_SOUND_PRESETS } from '../src/utils/audioPresets';

// dev/audioPowerProbe.ts
// Render the production graph through Chrome's real audio engine; count connected DSP, not watts.
export async function renderAudioPowerProbe(options: {
    rate?: number; mode?: 'ordinary' | 'stage' | 'mix' | 'eq' | 'effects' | 'switch'; volume?: number;
}) {
    const rate=options.rate ?? 48000, mode=options.mode ?? 'ordinary', length=Math.round(rate*.8);
    const offline=new OfflineAudioContext(2,length,rate);
    const nodes=new Map<AudioNode,string>(), edges=new Map<AudioNode,Set<AudioNode>>();
    const capture=(node:AudioNode,kind:string) => {
        if(nodes.has(node))return node;
        nodes.set(node,kind);edges.set(node,new Set());
        const connect=node.connect.bind(node),disconnect=node.disconnect.bind(node);
        node.connect=((to:AudioNode,...rest:unknown[])=>{
            if(to instanceof AudioNode)edges.get(node)!.add(to);
            return (connect as (...args:unknown[])=>unknown)(to,...rest);
        }) as AudioNode['connect'];
        node.disconnect=((to?:AudioNode,...rest:unknown[])=>{
            if(to===undefined)edges.get(node)!.clear();else if(to instanceof AudioNode)edges.get(node)!.delete(to);
            return to===undefined?disconnect():(disconnect as (...args:unknown[])=>void)(to,...rest);
        }) as AudioNode['disconnect'];
        return node;
    };
    capture(offline.destination,'destination');
    const input=offline.createBuffer(2,length,rate);
    for(let c=0;c<2;c++)for(let i=0;i<length;i++)input.getChannelData(c)[i]=.2*Math.sin(2*Math.PI*1000*i/rate);
    const sources:AudioBufferSourceNode[]=[];
    const context=new Proxy(offline,{get(target,key){
        if(key==='createMediaElementSource')return()=>{
            const source=offline.createBufferSource();source.buffer=input;sources.push(source);
            return capture(source,'source');
        };
        const value=Reflect.get(target,key,target);
        if(typeof value!=='function')return value;
        return (...args:unknown[])=>{
            const result=value.apply(target,args);
            return typeof key==='string'&&key.startsWith('create')&&result instanceof AudioNode?capture(result,key.replace('create','')):result;
        };
    }}) as unknown as AudioContext;
    const analyser=context.createAnalyser();
    const settings=resolveAudioEqualizerSettings(mode==='eq'?{enabled:true,gains:[0,0,0,0,6,0,0,0,0,0]}
        :mode==='effects'?{enabled:true,effects:AUDIO_SOUND_PRESETS.radio.effects}:{enabled:false});
    let decks:ReturnType<typeof connectAutomixDeck>[]=[];
    const graph=buildPlaybackGraph({context,analyser,settings,analysisEnabled:mode==='stage',equalizerNodesRef:{current:[]},
        connectDecks:(_,output)=>{
            decks=[connectAutomixDeck(context,{} as HTMLAudioElement,output,mode==='mix'),
                connectAutomixDeck(context,{} as HTMLAudioElement,output,mode==='mix')];
            decks[1].fade.gain.value=0;return true;
        }});
    decks[0].replayGain.gain.value=.8;graph.gainNode.gain.value=options.volume ?? .5;graph.fadeNode.gain.value=.7;
    const snapshot=()=>{
        const active=new Set<AudioNode>();
        const visit=(to:AudioNode)=>{if(active.has(to))return;active.add(to);for(const [from,targets]of edges)if(targets.has(to))visit(from);};
        visit(offline.destination);const counts:Record<string,number>={};
        for(const node of active){const kind=nodes.get(node)!;counts[kind]=(counts[kind]??0)+1;}
        return {allocated:nodes.size,connected:active.size,counts};
    };
    const initial=snapshot(),during:unknown[]=[];
    const controls:Promise<void>[]=[];
    if(mode==='switch')for(const [time,enabled]of [[.2,true],[.4,false]] as const)controls.push(offline.suspend(time).then(async()=>{
        for(const deck of decks)deck.setProcessingEnabled(enabled);
        graph.setAnalysisEnabled(enabled);
        graph.equalizer.apply({...settings,enabled});
        during.push({time:offline.currentTime,enabled,...snapshot()});await offline.resume();
    }));
    sources.forEach(source=>source.start());
    const rendered=await offline.startRendering();await Promise.all(controls);
    const data=rendered.getChannelData(0),volume=options.volume ?? .5;
    let square=0,maxError=0,peak=0,finite=true;
    for(let i=Math.round(rate*.05);i<data.length;i++) {
        const value=data[i];finite=finite&&Number.isFinite(value);square+=value*value;peak=Math.max(peak,Math.abs(value));
        const expected=input.getChannelData(0)[i]*.8*volume*.7;
        maxError=Math.max(maxError,Math.abs(value-expected));
    }
    const final=snapshot();graph.dispose?.();
    return {mode,rate,volume,initial,during,final,finite,peak,rms:Math.sqrt(square/(length-Math.round(rate*.05))),maxError};
}
