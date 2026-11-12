import React, { useLayoutEffect, useRef, useState } from 'react';
import type { RearRect } from '../../utils/rearCameraSafeArea';

// src/components/visualizer/RearFittedContent.tsx
// Fit wrapped text to the reading rectangle; font loading and resize never crop a sentence.
export default function RearFittedContent({area,align='center',children}:React.PropsWithChildren<{area:RearRect;align?:'center'|'bottom'}>){
    const content=useRef<HTMLDivElement>(null);
    const [scale,setScale]=useState(1);
    useLayoutEffect(()=>{
        const element=content.current;
        if(!element)return;
        let frame=0,lastSize='';
        // Reflow at the scaled width before fitting height, so large fonts retain the whole reading width.
        const measure=()=>{
            if(area.width<=0||area.height<=0)return;
            const size=[element.clientWidth,element.clientHeight,element.scrollWidth,element.scrollHeight].join(':');
            if(size===lastSize)return;
            const fits=(value:number)=>{
                element.style.width=area.width/value+'px';
                return element.scrollWidth*value<=area.width+.1&&element.scrollHeight*value<=area.height+.1;
            };
            let low=.001,high=1;
            if(fits(1))low=1;
            else for(let i=0;i<12;i++){
                const middle=(low+high)/2;
                if(fits(middle))low=middle;else high=middle;
            }
            const next=low;
            element.style.width=area.width/next+'px';
            lastSize=[element.clientWidth,element.clientHeight,element.scrollWidth,element.scrollHeight].join(':');
            setScale(previous=>Math.abs(previous-next)<.000001?previous:next);
        };
        measure();
        const observer=new ResizeObserver(()=>{
            if(!frame)frame=requestAnimationFrame(()=>{frame=0;measure();});
        });
        observer.observe(element);
        return()=>{observer.disconnect();cancelAnimationFrame(frame);};
    },[area.width,area.height,children]);
    return <div data-rear-fitted-content className="absolute pointer-events-none z-20" style={{...area}}>
        <div ref={content} style={{position:'absolute',width:area.width/scale,left:'50%',...(align==='bottom'?{bottom:0}:{top:'50%'}),
            transform:align==='bottom'?'translateX(-50%) scale('+scale+')':'translate(-50%, -50%) scale('+scale+')',
            transformOrigin:align==='bottom'?'center bottom':'center center',overflowWrap:'anywhere',whiteSpace:'normal'}}>{children}</div>
    </div>;
}
