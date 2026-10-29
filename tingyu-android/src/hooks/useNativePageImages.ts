import { useEffect, useMemo, useState } from 'react';
import type { NativePageModel } from '../types/nativePages';
import { useStableNativeData } from './useStableNativeData';
import { NATIVE_FIRST } from '../services/nativePages';
import { nativeCoverThumbnail, peekNativeCoverThumbnail } from '../services/nativeCoverThumbnail';

// src/hooks/useNativePageImages.ts
export function isWebManagedArtwork(url:string|undefined):url is string {
    if(!url)return false;
    if(url.startsWith('blob:'))return true;
    try{const parsed=new URL(url,location.href);return parsed.origin===location.origin&&parsed.pathname.startsWith('/__folia_cover/');}catch{return false;}
}
export function useNativePageImages(model:NativePageModel,active:boolean):NativePageModel {
    const [images,setImages]=useState<Record<string,string>>({});
    const urls=useStableNativeData(useMemo(()=>[...new Set([...model.sections.flatMap(section=>section.items??[]).map(item=>item.image),
        ...(model.document?.paints.map(paint=>paint.image)??[])].filter(isWebManagedArtwork))], [model]));
    useEffect(()=>{
        if(!NATIVE_FIRST||!active)return;
        const list=urls;if(!list.length)return;
        let alive=true,index=0,timer=0;const resolved:Record<string,string>={};
        const publish=()=>{timer=0;if(alive)setImages({...resolved})};
        const worker=async()=>{while(alive&&index<list.length){const url=list[index++];resolved[url]=await nativeCoverThumbnail(url);
            // Coalesce arrivals without making a fast cover wait for every slow cover in the page.
            if(alive&&!timer)timer=window.setTimeout(publish,48);
        }};
        void Promise.all(Array.from({length:Math.min(4,list.length)},worker)).then(()=>{clearTimeout(timer);publish()});
        return()=>{alive=false;clearTimeout(timer)};
    },[urls,active]);
    return useMemo(()=>{if(!urls.length)return model;
    const image=(url:string)=>images[url]||peekNativeCoverThumbnail(url)||'';
    return {...model,document:model.document?{...model.document,paints:model.document.paints.map(paint=>isWebManagedArtwork(paint.image)?{...paint,image:image(paint.image)}:paint)}:undefined,
        sections:model.sections.map(section=>({...section,items:section.items?.map(item=>
        isWebManagedArtwork(item.image)?{...item,image:image(item.image)}:item)}))};
    },[model,images,urls]);
}
