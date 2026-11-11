import {useEffect,useState,type RefObject} from 'react';
import {NATIVE_FIRST} from '../../services/nativePages';

// src/components/visualizer/useNativePreviewVisible.ts
// Only visibility edges enter React; native scroll coordinates stay outside component state.
export function useNativePreviewVisible(root:RefObject<HTMLElement|null>){
    const [visible,setVisible]=useState(!NATIVE_FIRST);
    useEffect(()=>{
        const element=root.current;if(!element)return;
        const update=()=>{
            const preview=element.querySelector<HTMLElement>('[data-folia-stage-preview]');
            setVisible(!NATIVE_FIRST||preview?.dataset.nativePreviewVisible==='true');
        };
        element.addEventListener('tingyu-preview-visibility',update);update();
        return()=>element.removeEventListener('tingyu-preview-visibility',update);
    },[root]);
    return visible;
}
