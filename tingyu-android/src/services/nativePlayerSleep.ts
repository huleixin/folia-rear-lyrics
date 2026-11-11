import { isAndroidNativeRuntime } from '../utils/platform';
import { chromeNative } from './nativeChrome';
import { setStatusMessage } from '../stores/useStatusMessageStore';

// src/services/nativePlayerSleep.ts

/** Android handles failures visibly and still consumes the action so no DOM sheet opens. */
export async function openNativeSleepTimer(): Promise<boolean> {
    if (!isAndroidNativeRuntime()) return false;
    try {
        const result = await chromeNative.openSleepTimer();
        if (!result.accepted) throw new Error('原生定时面板暂不可用，请稍后重试');
    } catch (error) {
        const detail = error instanceof Error ? error.message
            : typeof error === 'string' ? error
            : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : '';
        setStatusMessage({ type: 'error', text: detail || '无法打开原生定时面板，请稍后重试', nonce: Date.now() });
    }
    return true;
}
