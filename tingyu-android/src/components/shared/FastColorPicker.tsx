import React, { useEffect, useRef, useState } from 'react';
import { HslColorPicker, type HslColor } from 'react-colorful';
import {hexToHsl, hslToHex} from '../../utils/themeColorMath';

// src/components/shared/FastColorPicker.tsx
// Wraps react-colorful so its 60fps drag re-renders stay inside this component instead of
// re-rendering the whole editor; the parent receives values it can throttle on its own.

type FastColorPickerProps = {
    color: string;
    height?: number;
    onChange: (color: string) => void;
    onPointerDown?: () => void;
    visibleHueSelection?:boolean;
};

const toPickerColor=(color:string):HslColor=>{
    const hsl=hexToHsl(color)??{h:0,s:0,l:0};
    return {h:hsl.h,s:hsl.s*100,l:hsl.l*100};
};
const FastColorPicker: React.FC<FastColorPickerProps> = ({ color, height = 236, onChange, onPointerDown, visibleHueSelection=false }) => {
    const [localColor, setLocalColor] = useState(()=>toPickerColor(color));
    const emitted=useRef<string | undefined>(undefined);
    const nativeRef=useRef<HTMLDivElement>(null);
    useEffect(()=>{
        const element=nativeRef.current;
        const apply=(event:Event)=>{const next=(event as CustomEvent).detail;if(typeof next!=='string'||!/^#[\da-f]{6}$/i.test(next))return;onPointerDown?.();onChange(next);};
        element?.addEventListener('tingyu-native-color',apply);
        return()=>element?.removeEventListener('tingyu-native-color',apply);
    },[onChange,onPointerDown]);

    // Sync back when the parent switches mode or color field.
    useEffect(() => {
        // Parent throttling/hex rounding must not reset the hue during a drag.
        if(color.toLowerCase()!==emitted.current)setLocalColor(toPickerColor(color));
    }, [color]);

    const handleChange = (nextColor: HslColor) => {
        const hueOnly=nextColor.h!==localColor.h&&nextColor.s===localColor.s&&nextColor.l===localColor.l;
        // Hue alone cannot tint white/grey/black. Only a deliberate hue edit adds chroma;
        // the saturation pad and swatches can still select exact neutral colours.
        const next=visibleHueSelection&&hueOnly&&(nextColor.s<8||nextColor.l>95||nextColor.l<5)
            ?{...nextColor,s:Math.max(65,nextColor.s),l:Math.max(25,Math.min(75,nextColor.l))}:nextColor;
        setLocalColor(next);
        emitted.current=hslToHex({h:next.h,s:next.s/100,l:next.l/100});
        onChange(emitted.current);
    };

    return (
        <div ref={nativeRef} data-native-color={color} onPointerDown={onPointerDown} className="w-full h-full">
            <HslColorPicker color={localColor} onChange={handleChange} style={{ width: '100%', height }} />
        </div>
    );
};

export default FastColorPicker;
