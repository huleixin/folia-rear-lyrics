import { getFoliaNative } from '../../platform/foliaNative';
import { isAndroidNativeRuntime } from '../../utils/platform';
import { parseLxScript } from './contract';

// src/services/lxSource/importFile.ts
const native = getFoliaNative<{pickLxSourceFile(): Promise<{cancelled?: boolean; name?: string; text?: string}>}>();
/** Native actions cannot activate an HTML file input. SAF needs no storage permission. */
export async function pickLxScript() {
    if (isAndroidNativeRuntime()) {
        const result = await native.pickLxSourceFile();
        if (result.cancelled) return null;
        if (!result.name?.toLowerCase().endsWith('.js') || typeof result.text !== 'string') throw new Error('请选择可读取的 .js 音源文件');
        return parseLxScript(result.text);
    }
    // Open synchronously within the browser click's user activation, before awaiting anything.
    const file = await new Promise<File | null>(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.js,text/javascript,application/javascript';
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.addEventListener('cancel', () => resolve(null), {once: true});
        input.click();
    });
    if (!file) return null;
    if (!file.name.toLowerCase().endsWith('.js')) throw new Error('请选择 .js 音源文件');
    if (file.size > 1048576) throw new Error('音源脚本不能超过 1 MB');
    return parseLxScript(await file.text());
}
