import type { SettingsPaint,SettingsRect } from '../types/nativeSettingsDocument';

// src/services/nativeSettingsText.ts
// Capture actual browser line breaks rather than guessing CJK/inline wrapping.
export function settingsTextRuns(node:Text,style:CSSStyleDeclaration,rect:(value:DOMRect)=>SettingsRect,window?:{top:number;bottom:number}):SettingsPaint[]{
    if(!node.data.trim())return [];
    const range=document.createRange(),out:SettingsPaint[]=[];let start=0,limit=node.length;
    if(window&&node.length>200){
        const find=(threshold:number)=>{let low=0,high=node.length-1;while(low<high){const mid=(low+high)>>>1;range.setStart(node,mid);range.setEnd(node,mid+1);
            const box=rect(range.getBoundingClientRect());if(box.y+box.h<threshold)low=mid+1;else high=mid}return low};
        start=find(window.top);limit=Math.min(node.length,find(window.bottom)+1);
    }
    while(start<limit){
        let low=start+1,high=limit,end=low;
        while(low<=high){const mid=(low+high)>>>1;range.setStart(node,start);range.setEnd(node,mid);
            if(range.getClientRects().length<=1){end=mid;low=mid+1}else high=mid-1}
        range.setStart(node,start);range.setEnd(node,end);const box=range.getBoundingClientRect();
        if(box.width&&box.height)out.push({...rect(box),kind:'text',text:node.data.slice(start,end),color:style.color,
            font:parseFloat(style.fontSize),weight:Number(style.fontWeight)||400,family:style.fontFamily,italic:style.fontStyle==='italic'});
        start=end;
    }
    return out;
}
