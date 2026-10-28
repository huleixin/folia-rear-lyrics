import { useLxSourceStore } from '../../stores/useLxSourceStore';

// src/services/lxSource/selection.ts
export const selectedLxScript = () => {
    const state=useLxSourceStore.getState();return state.scripts.find(script=>script.id===state.activeId)??null;
};
export const lxPlatformFor = (provider:string) => provider.startsWith('lx-')?provider.slice(3)
    :({netease:'wy',qq:'tx',kugou:'kg',kuwo:'kw',migu:'mg'} as Record<string,string>)[provider];
