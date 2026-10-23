import React from 'react';
import { Check, FileUp, Search, Minus, Plus, RotateCcw } from 'lucide-react';
import type { UnifiedPanelProps } from '../UnifiedPanel';
import { useMobileToolsText } from './useMobileToolsText';
import { useMobileLyrics } from './useMobileLyrics';

// src/components/mobile-player/MobileLyricsTools.tsx
export default function MobileLyricsTools({ playback: p }: {playback:UnifiedPanelProps['playback']}) {
    const text = useMobileToolsText();
    const model = useMobileLyrics(p);
    const changeOffset = (v:number) => p.onLyricTimelineOffsetChange(Math.max(-60000,Math.min(60000,Math.round(v))));
    return <div className="ty-lyrics" data-testid="mobile-lyrics-tools">
        <section className="ty-card"><h3>{text.source}</h3><div className="ty-source-list" role="group" aria-label={text.source}>
            {model.options.map(option => <button key={option.id} className="ty-source" aria-pressed={model.selected === option.id} onClick={() => model.select(option.id)}><span>{option.label}</span>{model.selected === option.id && <Check size={20}/>}</button>)}
            {!model.options.length && <p className="ty-hint">{text.emptySources}</p>}
        </div>{model.navi && <p className="ty-hint">{text.serverHint}</p>}</section>
        <section className="ty-card ty-actions"><button className="ty-action ty-primary" onClick={model.match}><Search size={20}/><span>{text.match}<small>{text.matchingHint}</small></span></button>
            {!model.navi && <label className="ty-action ty-file" aria-disabled={model.busy}><FileUp size={20}/><span>{model.busy ? text.loading : text.import}<small>{text.importHint}</small></span><input aria-label={text.import} type="file" accept=".lrc,.ttml,.qrc,.krc,.yrc,.lys,.srt,.vtt,.txt,.fia,.json" disabled={model.busy} onChange={e => { const file=e.target.files?.[0];e.target.value='';if(file)void model.upload(file); }}/></label>}
            {model.message && <p role="status" className="ty-hint">{model.message}</p>}
        </section>
        <section className="ty-card"><div className="ty-card-heading"><h3>{text.offset}</h3><button className="ty-reset" disabled={!p.lyricTimelineOffsetMs} onClick={() => changeOffset(0)}><RotateCcw size={16}/>{text.reset}</button></div><p className="ty-hint">{text.offsetHint}</p>
            <div className="ty-offset"><button aria-label={text.earlier} onClick={() => changeOffset(p.lyricTimelineOffsetMs-250)}><Minus size={22}/><small>0.25 s</small></button><output aria-live="polite">{p.lyricTimelineOffsetMs>0?'+':''}{(p.lyricTimelineOffsetMs/1000).toFixed(2)}<small>s</small></output><button aria-label={text.later} onClick={() => changeOffset(p.lyricTimelineOffsetMs+250)}><Plus size={22}/><small>0.25 s</small></button></div>
            <label className="ty-precise">{text.precise}<input type="number" inputMode="numeric" value={p.lyricTimelineOffsetMs} min={-60000} max={60000} step={50} onChange={e => {if(e.target.value!=='')changeOffset(Number(e.target.value));}}/></label>
        </section>
        {(model.local || (!model.navi && p.onlineLyricsState?.hasOnlineOverride) || p.onlineLyricsState?.importedLyrics) && <details className="ty-card"><summary>{text.advanced}</summary>{model.local && <label className="ty-action ty-file"><FileUp size={20}/>{text.translation}<input aria-label={text.translation} type="file" accept=".lrc,.ttml,.txt" disabled={model.busy} onChange={e => {const file=e.target.files?.[0];e.target.value='';if(file)void model.upload(file,true);}}/></label>}{!model.local && !model.navi && <button className="ty-action" onClick={p.onClearOnlineLyricsState}>{text.clear}</button>}</details>}
    </div>;
}
