import { useEffect, useState } from 'react';
import { COMPOSE_CHROME } from '../services/nativeChrome';
import { nativeCoverThumbnail } from '../services/nativeCoverThumbnail';

// src/hooks/useNativeChromeCover.ts
// Blob covers cross the native boundary as one small thumbnail per track, never as frame snapshots.
export function useNativeChromeCover(url:string|null|undefined,active:boolean):string {
    const [blobCover,setBlobCover]=useState<{url:string;value:string}|null>(null);
    useEffect(()=>{
        if(!COMPOSE_CHROME||!active||!url?.startsWith('blob:'))return;
        let alive=true;void nativeCoverThumbnail(url).then(value=>{if(alive)setBlobCover({url,value});});
        return()=>{alive=false;};
    },[url,active]);
    if(url?.startsWith('blob:'))return blobCover?.url===url?blobCover.value:'';
    return url||'';
}
