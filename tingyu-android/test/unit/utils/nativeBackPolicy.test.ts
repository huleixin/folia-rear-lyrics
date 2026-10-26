// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { installNativeBackPolicy } from '../../../src/utils/nativeBackPolicy';
import { useMobileLibraryStore } from '../../../src/stores/useMobileLibraryStore';
import { useAppViewStore } from '../../../src/stores/useAppViewStore';
import { useSettingsModalStore } from '../../../src/stores/useSettingsModalStore';

// test/unit/utils/nativeBackPolicy.test.ts
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.innerHTML = ''; useSettingsModalStore.getState().closeSettings(); });
it('keeps root Back native, but routes settings, queue and DOM dialogs through the web handler', async () => {
    useAppViewStore.setState({ view: 'home', isPanelOpen: false });
    useSettingsModalStore.setState({ settingsModalState: { isOpen: false, initialTab: 'options' }, isUserGuideModalOpen: false });
    const publish = vi.fn(async () => undefined);
    dispose = installNativeBackPolicy({ setBackHandlerState: publish }, () => useAppViewStore.getState().view !== 'home');
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ handledInWeb: false }));
    useSettingsModalStore.getState().openSettings('options');
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ handledInWeb: true }));
    useSettingsModalStore.getState().closeSettings();
    useAppViewStore.setState({ isPanelOpen: true });
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ handledInWeb: true }));
    useAppViewStore.setState({ isPanelOpen: false });
    const modal = document.createElement('div'); modal.dataset.foliaKeyboardWindow = 'true'; document.body.append(modal);
    await Promise.resolve();
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ handledInWeb: true }));
    modal.remove(); await Promise.resolve();
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ handledInWeb: false }));
    useMobileLibraryStore.getState().setPage('library');
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ handledInWeb: true }));
    useMobileLibraryStore.getState().setPage('home');
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ handledInWeb: false }));
    const menu = document.createElement('div'); menu.setAttribute('role', 'menu'); document.body.append(menu);
    await Promise.resolve();
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ handledInWeb: true }));
    menu.remove(); await Promise.resolve();
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ handledInWeb: false }));
    const revisions = publish.mock.calls.map(call => (call as unknown as [{ revision: number }])[0].revision);
    expect(revisions.every((value, index) => index === 0 || value > revisions[index - 1])).toBe(true);
    const count = publish.mock.calls.length; useAppViewStore.setState({ panelTab: 'queue' });
    expect(publish).toHaveBeenCalledTimes(count);
});
