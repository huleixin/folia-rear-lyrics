// src/services/nativeCoverThumbnail.ts
// Shared, bounded thumbnail cache for blob artwork. No WebView frame capture or external requests.
const covers=new Map<string,Promise<string>>();
export function nativeCoverThumbnail(url:string):Promise<string> {
    const existing=covers.get(url);if(existing)return existing;
    const task=fetch(url).then(r=>r.blob()).then(async blob=>{
        const image=await createImageBitmap(blob,{resizeWidth:96,resizeHeight:96,resizeQuality:'medium'});
        try{
            const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
            const context=canvas.getContext('2d');if(!context)return '';
            context.drawImage(image,0,0,96,96);return canvas.toDataURL('image/jpeg',.72);
        }finally{image.close()}
    }).catch(()=>{covers.delete(url);return ''});
    if(covers.size>=128)covers.delete(covers.keys().next().value!);
    covers.set(url,task);return task;
}
