import { useSyncExternalStore } from 'react';

// src/services/rearPreparation.ts
// Only the verified LSP card URL opts in. Preparation never claims visibility or drawing ownership.
let preparing = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('nativeCard') === '1';
const deadline=preparing?Number(new URLSearchParams(window.location.search).get('prepareUntil')):0;
const remaining=deadline>0?Math.min(4500,Math.max(0,deadline-Date.now())):4500;
preparing=preparing&&remaining>0;
const listeners = new Set<() => void>();
let timer=0;
const onPower = (event:Event) => {
    if ((event as CustomEvent<{ sleeping: boolean }>).detail?.sleeping) stop();
};
const stop = () => {
    if (!preparing) return;
    preparing = false;
    clearTimeout(timer);window.removeEventListener('folia-rear-power',onPower);
    for (const listener of listeners) listener();
};
if (preparing) {
    timer=window.setTimeout(stop, remaining);
    window.addEventListener('folia-rear-power',onPower);
}
export const isRearPreparing = () => preparing;
export const useRearPreparing = () => useSyncExternalStore(listener => {
    listeners.add(listener); return () => { listeners.delete(listener); };
}, isRearPreparing, () => false);
