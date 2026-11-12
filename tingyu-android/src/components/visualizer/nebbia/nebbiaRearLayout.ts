import {fitRearCurrentLine,type RearRect} from '../../../utils/rearCameraSafeArea';
import type {LaidChar} from './nebbiaScene';

// src/components/visualizer/nebbia/nebbiaRearLayout.ts
// Fit actual warped/rotated strokes, including their width, without shrinking the glass canvas.
export function fitNebbiaLineToArea(chars:LaidChar[],area:RearRect,strokeWidth:number){
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(const c of chars){
        const cos=Math.cos(c.rot),sin=Math.sin(c.rot);
        const margin=Math.max(1.5,c.s*strokeWidth)/2+2;
        for(const stroke of c.glyph?.strokes??[])for(const [x,y] of stroke.pts){
            const px=c.x+((x-.5)*cos-(y-.5)*sin)*c.s;
            const py=c.y+((x-.5)*sin+(y-.5)*cos)*c.s;
            left=Math.min(left,px-margin);right=Math.max(right,px+margin);
            top=Math.min(top,py-margin);bottom=Math.max(bottom,py+margin);
        }
    }
    if(!Number.isFinite(left))return;
    // Keep a final pixel margin even when glyph scaling reaches the renderer's minimum stroke width.
    const inset=Math.min(2,area.width/4,area.height/4);
    const target={left:area.left+inset,top:area.top+inset,width:area.width-2*inset,height:area.height-2*inset};
    const fit=fitRearCurrentLine({left,top,width:right-left,height:bottom-top},target);
    for(const c of chars){c.x=fit.left+(c.x-left)*fit.scale;c.y=fit.top+(c.y-top)*fit.scale;c.s*=fit.scale;}
}
