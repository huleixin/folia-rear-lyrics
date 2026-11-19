import { getFoliaNative } from '../../platform/foliaNative';
import { isAndroidNativeRuntime } from '../../utils/platform';
import { parseLxScript } from './contract';

// src/services/lxSource/importFile.ts
const native = getFoliaNative<{pickLxSourceFile(): Promise<{cancelled?: boolean; name?: string; text?: string}>}>();
export interface PickLxScriptOptions {
    signal?: AbortSignal;
    onPicked?: () => void;
}
function abortError() {
    return new DOMException('已取消导入', 'AbortError');
}
function withAbort<T>(work: Promise<T>, signal?: AbortSignal, timeoutMs = 120000): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('文件读取超时，请重试')), timeoutMs);
        const onAbort = () => { clearTimeout(timer); reject(abortError()); };
        signal?.addEventListener('abort', onAbort, { once: true });
        work.then(
            value => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolve(value); },
            error => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(error); },
        );
    });
}
/** Native actions cannot activate an HTML file input. SAF needs no storage permission. */
export async function pickLxScript(options?: PickLxScriptOptions) {
    if (options?.signal?.aborted) throw abortError();
    if (isAndroidNativeRuntime()) {
        const result = await withAbort(native.pickLxSourceFile(), options?.signal);
        if (result.cancelled) return null;
        options?.onPicked?.();
        if (!result.name?.toLowerCase().endsWith('.js') || typeof result.text !== 'string') throw new Error('请选择可读取的 .js 音源文件');
        return parseLxScript(result.text);
    }
    // Open synchronously within the browser click's user activation, before awaiting anything.
    const file = await withAbort(new Promise<File | null>(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.js,text/javascript,application/javascript';
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.addEventListener('cancel', () => resolve(null), {once: true});
        input.click();
    }), options?.signal);
    if (!file) return null;
    options?.onPicked?.();
    if (!file.name.toLowerCase().endsWith('.js')) throw new Error('请选择 .js 音源文件');
    if (file.size > 1048576) throw new Error('音源脚本不能超过 1 MB');
    return parseLxScript(await file.text());
}
