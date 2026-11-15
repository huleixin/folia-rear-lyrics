import { assertLxImportPermit, useLxSourceStore } from '../../stores/useLxSourceStore';
import { omni } from '../onlineMusic/omni';
import { checkLxScript } from './management';
import type { LxScript } from './contract';

// src/services/lxSource/installation.ts
/** File, URL and update installs share consent before any imported code is loaded or executed. */
export async function installLxSource(load:()=>Promise<Omit<LxScript,'capabilities'>|null>,activate=true) {
    const state=useLxSourceStore.getState();
    const permit=await state.requestImport();
    if(!permit)return null;
    try {
        assertLxImportPermit(permit);
        const script=await load();
        if(!script)return null;
        assertLxImportPermit(permit);
        const result=await checkLxScript(script,permit);
        assertLxImportPermit(permit);
        const id=state.save({...script,capabilities:result.capabilities},permit);
        if(activate)omni.activateLxSource(id);
        return result;
    } finally { state.revokeImport(permit); }
}
