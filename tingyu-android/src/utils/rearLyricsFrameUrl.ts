// src/utils/rearLyricsFrameUrl.ts
// Forward validated rear-camera calibration and native preparation to the inner stage frame.
export function rearLyricsFrameUrl(search:string) {
    const source=new URLSearchParams(search);
    const target=new URLSearchParams({layer:'lyrics'});
    if(source.get('nativeCard')==='1') {
        target.set('nativeCard','1');
        const until=Number(source.get('prepareUntil'));
        if(Number.isFinite(until)&&until>0)target.set('prepareUntil',String(until));
    }
    const safe=Number(source.get('safeLeftPx')),width=Number(source.get('physicalWidthPx'));
    if(source.has('safeLeftPx')&&source.has('physicalWidthPx')&&Number.isFinite(safe)&&Number.isFinite(width)&&width>0&&safe>=0&&safe<width){
        target.set('safeLeftPx',String(safe));target.set('physicalWidthPx',String(width));
    }
    return '/rear-lyrics.html?'+target.toString();
}
