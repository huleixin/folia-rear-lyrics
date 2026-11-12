import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { LxRuntime } from './client';

// src/services/lxSource/session.ts
let runtime: LxRuntime | null = null;
let revision = -1;
let idle: ReturnType<typeof setTimeout> | null = null;
const activeCalls=new Map<LxRuntime,number>();
useLxSourceStore.subscribe(state => { if (state.revision !== revision) { runtime?.stop(); runtime = null; } });

export async function withLxRuntime<T>(work:(active:LxRuntime,state:ReturnType<typeof useLxSourceStore.getState>,current:()=>void)=>Promise<T>):Promise<T|null>{
    const state=useLxSourceStore.getState(),script=state.scripts.find(s=>s.id===state.activeId);
    if(!script)return null;
    if(idle)clearTimeout(idle);
    if(!runtime||runtime.isClosed||revision!==state.revision){runtime?.stop();runtime=new LxRuntime(script);revision=state.revision;}
    const active=runtime;activeCalls.set(active,(activeCalls.get(active)??0)+1);
    const current=()=>{if(useLxSourceStore.getState().revision!==state.revision)throw Error('音源已更换');};
    try{return await work(active,state,current);}finally{
        const remaining=(activeCalls.get(active)??1)-1;
        if(remaining>0)activeCalls.set(active,remaining);else activeCalls.delete(active);
        if(runtime===active&&!remaining)idle=setTimeout(()=>{if(!activeCalls.has(active)){active.stop();if(runtime===active)runtime=null;}},30000);
    }
}
