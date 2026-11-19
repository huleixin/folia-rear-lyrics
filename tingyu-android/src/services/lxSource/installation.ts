import { assertLxImportPermit, useLxSourceStore } from '../../stores/useLxSourceStore';
import { omni } from '../onlineMusic/omni';
import { checkLxScript } from './management';
import { classifyLx, noteLx, redactLx } from './diagnostics';
import type { LxScript } from './contract';

// src/services/lxSource/installation.ts
export type LxImportStage = 'consent' | 'picking' | 'reading' | 'downloading' | 'validating' | 'saving';
export interface InstallLxOptions {
    sourceKind?: 'file' | 'url' | 'update';
    signal?: AbortSignal;
    onStage?: (stage: LxImportStage) => void;
}
export function isLxAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const item = error as { name?: unknown; message?: unknown };
    return item.name === 'AbortError' || item.message === 'Cancelled' || item.message === '已取消导入';
}
/** File, URL and update installs share consent before any imported code is loaded or executed. */
export async function installLxSource(
    load: () => Promise<Omit<LxScript, 'capabilities'> | null>,
    activate = true,
    options?: InstallLxOptions,
) {
    const startedAt = Date.now();
    const kind = options?.sourceKind ?? 'file';
    let stage: LxImportStage = 'consent';
    const setStage = (next: LxImportStage) => { stage = next; options?.onStage?.(next); };
    const state = useLxSourceStore.getState();
    setStage('consent');
    const permit = await state.requestImport();
    if (!permit) {
        noteLx('import', 'import', `kind=${kind} stage=${stage} ms=${Date.now() - startedAt} result=cancelled`);
        return null;
    }
    try {
        if (options?.signal?.aborted) throw new DOMException('已取消导入', 'AbortError');
        assertLxImportPermit(permit);
        setStage(kind === 'url' ? 'downloading' : kind === 'update' ? 'reading' : 'picking');
        const script = await load();
        if (!script) {
            noteLx('import', 'import', `kind=${kind} stage=${stage} ms=${Date.now() - startedAt} result=cancelled`);
            return null;
        }
        if (options?.signal?.aborted) throw new DOMException('已取消导入', 'AbortError');
        assertLxImportPermit(permit);
        setStage('validating');
        const result = await checkLxScript(script, permit, { signal: options?.signal });
        if (options?.signal?.aborted) throw new DOMException('已取消导入', 'AbortError');
        assertLxImportPermit(permit);
        setStage('saving');
        const id = state.save({ ...script, capabilities: result.capabilities }, permit);
        if (activate) omni.activateLxSource(id);
        noteLx('import', 'init', `kind=${kind} stage=done ms=${Date.now() - startedAt} result=success`);
        return result;
    } catch (error) {
        const resultLabel = isLxAbortError(error) ? 'cancelled' : 'failed';
        noteLx('import', classifyLx(error), `kind=${kind} stage=${stage} ms=${Date.now() - startedAt} result=${resultLabel} detail=${redactLx(error)}`);
        throw error;
    } finally {
        state.revokeImport(permit);
    }
}
