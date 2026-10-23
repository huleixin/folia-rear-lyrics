import { useEffect } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { getFoliaNative } from '../platform/foliaNative';

// src/hooks/useAndroidMainInsets.ts
type MainInsets = { top: number; bottom: number; left: number; right: number };
const native = getFoliaNative<{
    getMainWindowInsets: () => Promise<MainInsets>;
    addListener: (name: string, listener: (insets: MainInsets) => void) => Promise<PluginListenerHandle>;
}>();

export function useAndroidMainInsets() {
    useEffect(() => {
        if (Capacitor.getPlatform() !== 'android') return;
        let disposed = false;
        let handle: PluginListenerHandle | undefined;
        let revision = 0;
        const apply = (insets: MainInsets) => {
            if (disposed) return;
            for (const side of ['top', 'bottom', 'left', 'right'] as const) {
                const value = insets[side];
                if (Number.isFinite(value) && value >= 0)
                    document.documentElement.style.setProperty(`--folia-main-inset-${side}`, `${value}px`);
            }
        };
        void native
            .addListener('mainWindowInsetsChanged', (insets) => {
                revision++;
                apply(insets);
            })
            .then(async (listener) => {
                if (disposed) {
                    void listener.remove();
                    return;
                }
                handle = listener;
                const requestedAt = revision;
                const insets = await native.getMainWindowInsets();
                if (revision === requestedAt) apply(insets);
            })
            .catch(() => undefined);
        return () => {
            disposed = true;
            void handle?.remove();
            for (const side of ['top', 'bottom', 'left', 'right'])
                document.documentElement.style.removeProperty(`--folia-main-inset-${side}`);
        };
    }, []);
}
