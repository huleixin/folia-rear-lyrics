import {create} from 'zustand';
import {persist} from 'zustand/middleware';

// src/stores/useRearInteractionStore.ts
// Functional preference shared by both rear backends, independent of visual profiles.
export const useRearInteractionStore=create<{tapControls:boolean;toggle:()=>void}>()(persist(set=>({
    tapControls:true,
    toggle:()=>set(state=>({tapControls:!state.tapControls})),
}),{name:'tingyu-rear-interaction',partialize:state=>({tapControls:state.tapControls})}));
