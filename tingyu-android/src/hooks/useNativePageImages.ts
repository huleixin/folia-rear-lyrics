import { useEffect, useMemo, useState } from 'react';
import type { NativePageModel } from '../types/nativePages';
import { useStableNativeData } from './useStableNativeData';
import { NATIVE_FIRST } from '../services/nativePages';
import { nativeCoverThumbnail } from '../services/nativeCoverThumbnail';

// src/hooks/useNativePageImages.ts
export function useNativePageImages(model:NativePageModel,active:boolean):NativePageModel {
    const [images,setImages]=useState<Record<string,string>>({});
    const urls=useStableNativeData(useMemo(()=>[...new Set([...model.sections.flatMap(section=>section.items??[]).map(item=>item.image),
        ...(model.document?.paints.map(paint=>paint.image)??[])].filter((url):url is string=>!!url?.startsWith('blob:')))], [model]));
    useEffect(()=>{
        if(!NATIVE_FIRST||!active)return;
        const list=urls;if(!list.length)return;
        let alive=true,index=0;const resolved:Record<string,string>={};
        const worker=async()=>{while(alive&&index<list.length){const url=list[index++];resolved[url]=await nativeCoverThumbnail(url)}};
        void Promise.all(Array.from({length:Math.min(4,list.length)},worker)).then(()=>{if(alive)setImages(resolved)});
        return()=>{alive=false};
    },[urls,active]);
    return useMemo(()=>{if(!urls.length)return model;
    return {...model,document:model.document?{...model.document,paints:model.document.paints.map(paint=>paint.image?.startsWith('blob:')?{...paint,image:images[paint.image]??''}:paint)}:undefined,
        sections:model.sections.map(section=>({...section,items:section.items?.map(item=>
        item.image?.startsWith('blob:')?{...item,image:images[item.image]??''}:item)}))};
    },[model,images,urls]);
}
