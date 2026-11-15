import { useLxSourceStore } from '../../stores/useLxSourceStore';

// src/services/lxSource/selection.ts
export const selectedLxScript = () => {
    const state=useLxSourceStore.getState();return state.extensionEnabled?state.scripts.find(script=>script.id===state.activeId)??null:null;
};
export const lxPlatformFor = (provider:string) => provider.startsWith('lx-')?provider.slice(3)
    :({netease:'wy',qq:'tx',kugou:'kg',kuwo:'kw',migu:'mg'} as Record<string,string>)[provider];

/** Only explicitly enabled backup scripts participate; the selected script stays first. */
export function enabledLxScripts(state = useLxSourceStore.getState()) {
    if (!state.extensionEnabled) return [];
    const active = state.scripts.find(script => script.id === state.activeId);
    if (!active) return [];
    const ids = state.policy.scriptFallback ? state.policy.scriptOrder : [];
    return [active, ...ids.filter(id => id !== active.id).flatMap(id => state.scripts.find(s => s.id === id) ?? [])];
}
