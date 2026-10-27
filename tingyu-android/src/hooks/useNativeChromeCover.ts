import { useEffect, useState } from 'react';
import { COMPOSE_CHROME } from '../services/nativeChrome';

// src/hooks/useNativeChromeCover.ts
// Blob covers cross the native boundary as one small thumbnail per track, never as frame snapshots.
const covers = new Map<string,Promise<string>>();
function thumbnail(url:string):Promise<string> {
    const existing=covers.get(url);if(existing)return existing;
    const task=fetch(url).then(r=>r.blob()).then(async blob=>{
        const image=await createImageBitmap(blob,{resizeWidth:96,resizeHeight:96,resizeQuality:'medium'});
        try { const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
            const context=canvas.getContext('2d');if(!context)return '';
            context.drawImage(image,0,0,96,96);return canvas.toDataURL('image/jpeg',.8);
        }finally{image.close();}
    }).catch(()=>{covers.delete(url);return '';});
    if(covers.size>=24)covers.delete(covers.keys().next().value!);
    covers.set(url,task);return task;
}
export function useNativeChromeCover(url:string|null|undefined,active:boolean):string {
    const [blobCover,setBlobCover]=useState<{url:string;value:string}|null>(null);
    useEffect(()=>{
        if(!COMPOSE_CHROME||!active||!url?.startsWith('blob:'))return;
        let alive=true;void thumbnail(url).then(value=>{if(alive)setBlobCover({url,value});});
        return()=>{alive=false;};
    },[url,active]);
    if(url?.startsWith('blob:'))return blobCover?.url===url?blobCover.value:'';
    return url||'';
}
