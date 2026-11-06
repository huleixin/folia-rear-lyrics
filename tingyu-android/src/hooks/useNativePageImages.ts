import { navigationMark } from '../services/navigationTiming';
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
export function useNativePageImages(model:NativePageModel|null,active:boolean):NativePageModel|null {
    const [images,setImages]=useState<Record<string,string>>({});
    // model 为 null 表示「数据未就绪、暂不发包」：url 收集与最终替换都安全空过，
    // hook 顺序不能变（model 会在水合完成后 null→非 null 翻转）。
    const urls=useStableNativeData(useMemo(()=>model?[...new Set([...model.sections.flatMap(section=>section.items??[]).map(item=>item.image),
        ...(model.document?.paints.map(paint=>paint.image)??[])].filter(isWebManagedArtwork))]:[], [model]));
    useEffect(()=>{
        if(!NATIVE_FIRST||!active)return;
        const list=urls;if(!list.length)return;
        navigationMark('native-thumbnail-batch-start');const started=performance.timeOrigin+performance.now();
        let alive=true,timer=0;const resolved:Record<string,string>={};
        const failed=new Set<string>();
        const publish=()=>{timer=0;if(alive)setImages({...resolved})};
        // 单批处理：并发 4，按模型顺序（即可见顺序）推进；失败项记入 failed，不发布空串。
        const process=(batch:string[]):Promise<void>=>{
            let index=0;
            const worker=async()=>{while(alive&&index<batch.length){const url=batch[index++];const value=await nativeCoverThumbnail(url);
                if(value)resolved[url]=value;else failed.add(url);
                // Coalesce arrivals without making a fast cover wait for every slow cover in the page.
                if(alive&&!timer)timer=window.setTimeout(publish,48);
            }};
            return Promise.all(Array.from({length:Math.min(4,batch.length)},worker)).then(()=>{});
        };
        void process(list).then(()=>{navigationMark('native-thumbnail-batch-end',started);clearTimeout(timer);publish()});
        // 封面失败自动恢复（2026-11-06 首页封面专项）：冷启动 Service Worker 未认领页面或
        // 封面资产尚未写入时首批 fetch 会落空。controllerchange 与封面落库事件是有界的真实
        // 就绪信号 —— 只对失败项补一轮（nativeCoverThumbnail 按 URL 合并请求并缓存，成功后
        // 自然命中）；成功项绝不重解，无固定延迟轮询，不整页刷新。
        const retry=()=>{
            if(!alive||!failed.size)return;
            const targets=[...failed].filter(url=>!resolved[url]);failed.clear();
            if(!targets.length)return;
            navigationMark('native-thumbnail-retry');
            void process(targets).then(()=>{clearTimeout(timer);publish()});
        };
        const container=typeof navigator==='undefined'?undefined:navigator.serviceWorker;
        container?.addEventListener?.('controllerchange',retry);
        if(typeof window!=='undefined')window.addEventListener('folia-local-music-updated',retry);
        return()=>{alive=false;clearTimeout(timer);container?.removeEventListener?.('controllerchange',retry);
            if(typeof window!=='undefined')window.removeEventListener('folia-local-music-updated',retry);};
    },[urls,active]);
    return useMemo(()=>{if(!model)return model;if(!urls.length)return model;
    const image=(url:string)=>images[url]||peekNativeCoverThumbnail(url)||'';
    return {...model,document:model.document?{...model.document,paints:model.document.paints.map(paint=>isWebManagedArtwork(paint.image)?{...paint,image:image(paint.image)}:paint)}:undefined,
        sections:model.sections.map(section=>({...section,items:section.items?.map(item=>
        isWebManagedArtwork(item.image)?{...item,image:image(item.image)}:item)}))};
    },[model,images,urls]);
}
