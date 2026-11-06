// src/services/nativeCoverThumbnail.ts
// Shared, bounded thumbnail cache for blob artwork. No WebView frame capture or external requests.
const covers=new Map<string,Promise<string>>();
const ready=new Map<string,string>();
export const peekNativeCoverThumbnail=(url:string)=>ready.get(url);
export function nativeCoverThumbnail(url:string):Promise<string> {
    const existing=covers.get(url);if(existing)return existing;
    const task=fetch(url).then(r=>r.blob()).then(async blob=>{
        const image=await createImageBitmap(blob,{resizeWidth:96,resizeHeight:96,resizeQuality:'medium'});
        try{
            const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
            const context=canvas.getContext('2d');if(!context)return '';
            context.drawImage(image,0,0,96,96);const result=canvas.toDataURL('image/jpeg',.72);
            ready.set(url,result);while(ready.size>128)ready.delete(ready.keys().next().value!);
            return result;
        }finally{image.close()}
    }).catch(()=>{covers.delete(url);return ''});
    if(covers.size>=128)covers.delete(covers.keys().next().value!);
    covers.set(url,task);return task;
}

// ---------------------------------------------------------------------------
// 播放器封面的**统一解析入口**（专项修复：本地歌在完整播放页 / 通知里变成默认音符）。
//
// 本地曲库封面走 /__folia_cover/<assetId>（Service Worker 提供）或 blob:（封面缓存层），
// 两者都只在 WebView 内部有效。资料库列表和迷你播放器是 WebView DOM，能显示；
// 而原生 Compose 播放页、Media3 通知/媒体会话在 WebView 之外，拿这两种地址一律解码失败。
//
// 这里沿用上面同一套做法（fetch → 缩放 → data:image/jpeg），只是尺寸给播放器用的大图。
// data: 不依赖任何协议、进程或授权，WebView 与原生都能读；按封面 URL（含稳定的 assetId）
// 缓存，切歌时 URL 变化自然换图，不会残留上一首。url 本身不是 Web 管理地址时原样返回，
// 在线 CDN 封面完全不受影响。
// ---------------------------------------------------------------------------
const PLAYER_ARTWORK_SIZE=320;
const PLAYER_ARTWORK_QUALITY=.72;
const PLAYER_ARTWORK_CACHE_LIMIT=24;
const playerInflight=new Map<string,Promise<string>>();
const playerReady=new Map<string,string>();
const playerListeners=new Set<()=>void>();

/** 只在 WebView 内可解析、原生拿不到的封面地址。 */
export const isWebManagedArtworkUrl=(url:string|null|undefined):url is string=>{
    if(!url)return false;
    if(url.startsWith('blob:'))return true;
    if(url.startsWith('folia-cover://'))return true;
    try{
        const parsed=new URL(url,typeof location==='undefined'?'http://localhost':location.href);
        return parsed.origin===(typeof location==='undefined'?'http://localhost':location.origin)
            && parsed.pathname.startsWith('/__folia_cover/');
    }catch{return false;}
};

/** 同步读已解析好的原生可读封面；没有就返回空串。 */
export const peekNativePlayerArtwork=(url:string):string=>playerReady.get(url)??'';

/** 解析完成通知：各消费方据此重推一次自己的 payload。 */
export const subscribeNativePlayerArtwork=(listener:()=>void):(()=>void)=>{
    playerListeners.add(listener);
    return()=>{playerListeners.delete(listener)};
};

const drawToDataUrl=(source:CanvasImageSource):string=>{
    const canvas=document.createElement('canvas');
    canvas.width=PLAYER_ARTWORK_SIZE;canvas.height=PLAYER_ARTWORK_SIZE;
    const context=canvas.getContext('2d');if(!context)return '';
    context.drawImage(source,0,0,PLAYER_ARTWORK_SIZE,PLAYER_ARTWORK_SIZE);
    return canvas.toDataURL('image/jpeg',PLAYER_ARTWORK_QUALITY);
};

/** 异步把 WebView 封面转成原生可读的 data:。失败返回空串，调用方保留原地址。 */
export const prewarmNativePlayerArtwork=(url:string):Promise<string>=>{
    const cached=playerReady.get(url);if(cached)return Promise.resolve(cached);
    const existing=playerInflight.get(url);if(existing)return existing;
    const task=(async()=>{
        const response=await fetch(url);
        const blob=await response.blob();
        let result='';
        try{
            const bitmap=await createImageBitmap(blob,{
                resizeWidth:PLAYER_ARTWORK_SIZE,resizeHeight:PLAYER_ARTWORK_SIZE,resizeQuality:'medium',
            });
            try{result=drawToDataUrl(bitmap)}finally{bitmap.close()}
        }catch{
            // 少数 WebView 没有 createImageBitmap：退回 <img> 解码，仍是同源 blob，canvas 不会被污染。
            const objectUrl=URL.createObjectURL(blob);
            try{
                const image=new Image();image.src=objectUrl;
                await new Promise<void>((resolve,reject)=>{
                    image.onload=()=>resolve();image.onerror=()=>reject(new Error('cover-decode-failed'));
                });
                result=drawToDataUrl(image);
            }finally{URL.revokeObjectURL(objectUrl)}
        }
        if(!result)return '';
        playerReady.set(url,result);
        while(playerReady.size>PLAYER_ARTWORK_CACHE_LIMIT){
            playerReady.delete(playerReady.keys().next().value!);
        }
        playerListeners.forEach(listener=>{try{listener()}catch{/* 一个消费方失败不影响其它 */}});
        return result;
    })().catch(()=>'');
    if(playerInflight.size>=PLAYER_ARTWORK_CACHE_LIMIT){
        playerInflight.delete(playerInflight.keys().next().value!);
    }
    playerInflight.set(url,task);
    void task.finally(()=>{if(playerInflight.get(url)===task)playerInflight.delete(url)});
    return task;
};

/**
 * 同步解析：所有需要把封面交给原生的地方都走这里。
 * 首次尚未解析完时先返回原地址（WebView 侧仍可用），解析完成后由
 * subscribeNativePlayerArtwork 触发重推，下一次就是 data:。
 */
export const resolveNativePlayerArtwork=(url:string|null|undefined):string=>{
    if(!url)return '';
    if(!isWebManagedArtworkUrl(url))return url;
    const cached=peekNativePlayerArtwork(url);
    if(cached)return cached;
    void prewarmNativePlayerArtwork(url);
    return url;
};
