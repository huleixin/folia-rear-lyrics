import { create } from 'zustand';
import type { LxScript } from '../services/lxSource/contract';

// src/stores/useLxSourceStore.ts
const KEY = 'tingyu_lx_sources_v1';
function read(): { scripts: LxScript[]; activeId: string | null } {
    try { const value = JSON.parse(localStorage.getItem(KEY) || '{}'); return { scripts: Array.isArray(value.scripts) ? value.scripts.slice(0, 8).filter((s: LxScript) => typeof s.code === 'string' && s.code.length <= 1048576) : [], activeId: typeof value.activeId === 'string' ? value.activeId : null }; } catch { return { scripts: [], activeId: null }; }
}
export const useLxSourceStore = create<{
    scripts: LxScript[]; activeId: string | null; open: boolean; revision: number;
    show: () => void; close: () => void; save: (script: LxScript) => void;
    activate: (id: string | null) => void; remove: (id: string) => void;
}>((set, get) => {
    const persist = (scripts: LxScript[], activeId: string | null) => {
        localStorage.setItem(KEY, JSON.stringify({ scripts, activeId }));
        set({ scripts, activeId, revision: get().revision + 1 });
    };
    return { ...read(), open: false, revision: 0, show: () => set({ open: true }), close: () => set({ open: false }),
        save: script => { const scripts = [...get().scripts.filter(s => s.id !== script.id), script]; if (scripts.length > 8) throw new Error('最多保存 8 个音源'); persist(scripts, get().activeId); },
        activate: id => persist(get().scripts, id && get().scripts.some(s => s.id === id) ? id : null),
        remove: id => persist(get().scripts.filter(s => s.id !== id), get().activeId === id ? null : get().activeId),
    };
});
