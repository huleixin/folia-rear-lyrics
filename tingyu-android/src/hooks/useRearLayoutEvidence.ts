import {useEffect, type RefObject} from 'react';
import {getRearModeReceipt} from '../services/rearAodRuntime';
import {getRearSafeInset} from '../utils/visualizerSurface';

// src/hooks/useRearLayoutEvidence.ts
// Bounded, event-driven layout evidence from the actual lyric iframe. No text or per-frame probes.
export function useRearLayoutEvidence(content:RefObject<{lines:number;hasTrack:boolean}>) {
    useEffect(()=>{
        if(new URLSearchParams(location.search).get('nativeCard')!=='1')return;
        let first=0,settled=0,last='';
        const report=()=>{
            const root=document.querySelector<HTMLElement>('[data-testid="rear-lyrics-panel"]');
            const safe=getRearSafeInset(),receipt=getRearModeReceipt();
            if(!root||!safe)return;
            const box=root.getBoundingClientRect(),w=document.documentElement.clientWidth,h=document.documentElement.clientHeight;
            const glyphs=[...document.querySelectorAll<HTMLElement>('[data-cadenza-words] > div > div > span:first-child')]
                .filter(node=>Number(getComputedStyle(node).opacity)>.02&&node.getBoundingClientRect().width>.1);
            const rects=glyphs.map(node=>node.getBoundingClientRect());
            const values={sequence:receipt.sequence,w,h,rw:box.width,rh:box.height,sw:safe.width,sh:safe.height,
                shell:!!root.querySelector('.font-sans, .font-serif, .font-mono, canvas'),
                lines:content.current.lines,hasTrack:content.current.hasTrack,glyphs:glyphs.length,
                gx:rects.length?Math.min(...rects.map(r=>r.left)):0,gy:rects.length?Math.min(...rects.map(r=>r.top)):0,
                gr:rects.length?Math.max(...rects.map(r=>r.right)):0,gb:rects.length?Math.max(...rects.map(r=>r.bottom)):0};
            const key=JSON.stringify(values);if(key===last)return;last=key;
            const query=new URLSearchParams(Object.entries(values).map(([k,v])=>[k,String(typeof v==='number'?Math.round(v*100)/100:v)]));
            void fetch('/__folia_rear/layout-report?'+query,{cache:'no-store'}).catch(()=>undefined);
        };
        const schedule=()=>{clearTimeout(first);clearTimeout(settled);first=window.setTimeout(report,120);settled=window.setTimeout(report,1000);};
        const events=['resize','folia-rear-mode','folia-rear-power','folia-rear-content-config'];
        events.forEach(event=>window.addEventListener(event,schedule));schedule();
        // Lazy renderer mount is significant; word/character mutations are not sampled.
        const observer=new MutationObserver(records=>{
            if(records.some(record=>[...record.addedNodes].some(node=>node instanceof Element&&
                (node.matches('.font-sans, .font-serif, .font-mono, canvas')||node.querySelector('.font-sans, .font-serif, .font-mono, canvas')))))schedule();
        });
        observer.observe(document.getElementById('root')!,{childList:true,subtree:true});
        return()=>{observer.disconnect();clearTimeout(first);clearTimeout(settled);events.forEach(event=>window.removeEventListener(event,schedule));};
    },[content]);
}
