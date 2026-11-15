import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { LxRuntime } from './client';
import type { LxScript, LxCapabilities } from './contract';

// Never mutate activeId to try another script. Each script has an isolated runtime.
const sessions = new Map<string, { runtime: LxRuntime; revision: number; calls: number; timer?: ReturnType<typeof setTimeout> }>();
useLxSourceStore.subscribe(state => {
    for (const [id, session] of sessions) if (session.revision !== state.revision) {
        clearTimeout(session.timer); session.runtime.stop(); sessions.delete(id);
    }
});
export async function withLxRuntime<T>(
    work: (active: LxRuntime, state: ReturnType<typeof useLxSourceStore.getState>, current: () => void) => Promise<T>,
    script?: LxScript,
): Promise<T | null> {
    const state = useLxSourceStore.getState();
    if (!state.extensionEnabled) return null;
    script ??= state.scripts.find(s => s.id === state.activeId);
    if (!script) return null;
    let session = sessions.get(script.id);
    if (!session || session.runtime.isClosed || session.revision !== state.revision) {
        session?.runtime.stop();
        session = { runtime: new LxRuntime(script), revision: state.revision, calls: 0 };
        sessions.set(script.id, session);
    }
    const id = script.id, live = session;
    clearTimeout(live.timer); live.calls++;
    const current = () => { if (useLxSourceStore.getState().revision !== state.revision) throw new DOMException('Audio source changed', 'AbortError'); };
    try { return await work(live.runtime, state, current); } finally {
        if (--live.calls === 0) live.timer = setTimeout(() => {
            if (!live.calls) { live.runtime.stop(); if (sessions.get(id) === live) sessions.delete(id); }
        }, 30000);
    }
}

/** A failed initialization terminates its worker and HTTP calls instead of leaking behind a timeout. */
export async function waitForLxReady(runtime:LxRuntime,timeoutMs:number):Promise<LxCapabilities>{
    if(timeoutMs<=0)throw Error('音源初始化超时');
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([runtime.ready,new Promise<never>((_resolve,reject)=>{
        timer=setTimeout(()=>{const error=Error('音源初始化超时');runtime.stop(error);reject(error);},timeoutMs);
    })]);}finally{clearTimeout(timer);}
}
