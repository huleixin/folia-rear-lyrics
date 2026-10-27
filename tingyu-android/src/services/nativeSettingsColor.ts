import type {NativeSettingsDocument} from '../types/nativeSettingsDocument';

// src/services/nativeSettingsColor.ts
// Tailwind may resolve colors to OKLab/color-mix. Let Chromium convert those to sRGB
// once per distinct color, rather than silently dropping their native paint.
const colors=new Map<string,string>();let context:CanvasRenderingContext2D|null|undefined;
function color(value:string|undefined):string|undefined{
    if(!value||/^(?:rgba?\(|#|transparent$|auto$)/.test(value))return value;
    const cached=colors.get(value);if(cached)return cached;
    if(!CSS.supports('color',value))return value;
    if(context===undefined){const canvas=document.createElement('canvas');canvas.width=canvas.height=1;context=canvas.getContext('2d',{willReadFrequently:true})}
    if(!context)return value;context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);
    const [r,g,b,a]=context.getImageData(0,0,1,1).data,result=`rgba(${r}, ${g}, ${b}, ${a/255})`;
    if(colors.size>=512)colors.delete(colors.keys().next().value!);colors.set(value,result);return result;
}
function gradient(value:string|undefined){
    if(!value)return value;const pattern=/\b(?:rgba?|hsla?|oklab|oklch|lab|lch|color|color-mix)\(/g;let result='',start=0,match:RegExpExecArray|null;
    while((match=pattern.exec(value))){let end=pattern.lastIndex,depth=1;while(end<value.length&&depth){if(value[end]==='(')depth++;if(value[end]===')')depth--;end++}
        result+=value.slice(start,match.index)+color(value.slice(match.index,end));start=end;pattern.lastIndex=end;
    }return result+value.slice(start);
}
export function normalizeSettingsColors(document:NativeSettingsDocument):NativeSettingsDocument{
    return {...document,paints:document.paints.map(p=>({...p,color:color(p.color),background:color(p.background),border:color(p.border),gradient:gradient(p.gradient),
        edges:p.edges?.map(edge=>({...edge,color:color(edge.color)??edge.color}))})),controls:document.controls.map(c=>({...c,color:color(c.color),accent:color(c.accent)}))};
}
