import { useMobileLibraryStore } from '../stores/useMobileLibraryStore';
import { useAppViewStore } from '../stores/useAppViewStore';
import { useCollectionNavigationStore } from '../stores/useCollectionNavigationStore';
import { useSearchNavigationStore } from '../stores/useSearchNavigationStore';
import { useSettingsModalStore } from '../stores/useSettingsModalStore';
import { hasBlockingWindow } from './keyboardTargets';

// src/utils/nativeBackPolicy.ts
type BackPolicyPlugin = { setBackHandlerState?: (state: { handledInWeb: boolean; revision: number }) => Promise<unknown> };
let revision = Date.now() * 1000;
const BACK_OVERLAY = '[data-folia-keyboard-window="true"],[role="dialog"],[role="menu"],[role="listbox"]';
export const hasNativeBackOverlay = () => hasBlockingWindow() || Boolean(document.querySelector(BACK_OVERLAY));
/** Mirror discrete navigation demand. Root Back can then return Home without a JS round trip. */
export function installNativeBackPolicy(plugin: BackPolicyPlugin, canNavigateBack: () => boolean) {
    if (!plugin.setBackHandlerState) return () => {};
    let last: boolean | undefined;
    const send = (handledInWeb: boolean) => {
        if (last === handledInWeb) return;
        last = handledInWeb;
        void plugin.setBackHandlerState!({ handledInWeb, revision: ++revision }).catch(() => undefined);
    };
    const update = () => {
        const app = useAppViewStore.getState(), settings = useSettingsModalStore.getState();
        send(canNavigateBack() || useMobileLibraryStore.getState().page === 'library' || app.isPanelOpen || settings.settingsModalState.isOpen
            || settings.isUserGuideModalOpen || hasNativeBackOverlay());
    };
    const subscriptions = [useMobileLibraryStore.subscribe(update), useAppViewStore.subscribe(update), useCollectionNavigationStore.subscribe(update),
        useSearchNavigationStore.subscribe(update), useSettingsModalStore.subscribe(update)];
    const observer = new MutationObserver(records => {
        const blocker = (node: Node) => node instanceof Element && (node.matches(BACK_OVERLAY)
            || node.querySelector(BACK_OVERLAY));
        if (records.some(record => record.type === 'attributes'
            || [...record.addedNodes, ...record.removedNodes].some(blocker))) update();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-folia-keyboard-window', 'role'] });
    update();
    return () => { observer.disconnect(); subscriptions.forEach(stop => stop()); send(true); };
}
