// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/settings/libraryWallLookSettings.test.ts
// 界面设置「Bravais 墙面」分组（BravaisSettingsSection）与其中的透光设置（B6b②）：整组只在生效 suite 是 bravais 时渲染；
// 透光三档单选，部分透明时才出现 1–6 档的每块窗数（带百分比）；集合叠页边是一个开关（默认开）；点击都写进
// useLibraryWallLookStore。谓词本身在 bravaisLibraryActive.test 里测，这里用替身控制它；文案用 key 原样输出。

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const gate = vi.hoisted(() => ({ isBravaisActive: false }));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => (
            options ? `${key}:${JSON.stringify(options)}` : key
        ),
    }),
}));

vi.mock('@/library/app/bravaisLibraryActive', () => ({
    useIsBravaisLibraryActive: () => gate.isBravaisActive,
}));

let storage: Map<string, string>;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    gate.isBravaisActive = false;
    const { useLibraryWallLookStore } = await import('@/stores/useLibraryWallLookStore');
    useLibraryWallLookStore.setState({ look: 'partial', windowsPerBlock: 3, collectionStackEdges: true });
});

const renderGroup = async () => {
    const { default: BravaisSettingsSection } = await import('@/components/modal/settings/BravaisSettingsSection');
    act(() => {
        root.render(createElement(BravaisSettingsSection, { isDaylight: false, settingsCardClass: '' }));
    });
};

const render = async () => {
    const { default: LibraryWallLookSettings } = await import('@/components/modal/settings/LibraryWallLookSettings');
    act(() => {
        root.render(createElement(LibraryWallLookSettings, { isDaylight: false, accentColor: '#60a5fa' }));
    });
};

const lookButtons = () => [...container.querySelectorAll<HTMLButtonElement>('[data-library-wall-look]')];
const windowButtons = () => [...container.querySelectorAll<HTMLButtonElement>('[data-library-wall-windows]')];

describe('BravaisSettingsSection', () => {
    it('renders nothing unless bravais is the effective suite', async () => {
        gate.isBravaisActive = false;
        await renderGroup();

        expect(container.innerHTML).toBe('');
    });

    it('groups the transparency, the windows per block and the stack edges under one heading', async () => {
        gate.isBravaisActive = true;
        await renderGroup();

        expect(container.querySelector('h3')?.textContent).toContain('options.bravaisSettings');
        expect(container.querySelector('[data-bravais-settings]')).not.toBeNull();
        expect(lookButtons()).toHaveLength(3);
        expect(windowButtons()).toHaveLength(6);
        expect(container.querySelector('[data-bravais-stack-edges-toggle]')).not.toBeNull();
    });

    it('turns the collection stack edges off and on again', async () => {
        gate.isBravaisActive = true;
        await renderGroup();
        const { useLibraryWallLookStore } = await import('@/stores/useLibraryWallLookStore');
        const toggle = () => container.querySelector<HTMLButtonElement>('[data-bravais-stack-edges-toggle]')!;

        expect(toggle().getAttribute('aria-checked')).toBe('true');
        act(() => toggle().click());
        expect(useLibraryWallLookStore.getState().collectionStackEdges).toBe(false);
        expect(storage.get('library_wall_stack_edges')).toBe('false');
        expect(toggle().getAttribute('aria-checked')).toBe('false');
        act(() => toggle().click());
        expect(useLibraryWallLookStore.getState().collectionStackEdges).toBe(true);
        expect(storage.get('library_wall_stack_edges')).toBe('true');
    });
});

describe('LibraryWallLookSettings', () => {
    it('shows the three looks with the stored one checked, and the window counts under partial', async () => {
        gate.isBravaisActive = true;
        await render();

        expect(lookButtons().map(button => button.dataset.libraryWallLook)).toEqual(['solid', 'partial', 'clear']);
        expect(lookButtons().map(button => button.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);

        expect(windowButtons().map(button => button.dataset.libraryWallWindows)).toEqual(['1', '2', '3', '4', '5', '6']);
        expect(windowButtons().map(button => button.textContent)).toEqual(['18%', '217%', '325%', '433%', '542%', '650%']);
        expect(windowButtons().find(button => button.getAttribute('aria-checked') === 'true')?.dataset.libraryWallWindows).toBe('3');
    });

    it('stores a picked window count and hides the counts outside partial', async () => {
        gate.isBravaisActive = true;
        await render();
        const { useLibraryWallLookStore } = await import('@/stores/useLibraryWallLookStore');

        act(() => windowButtons()[4].click());
        expect(useLibraryWallLookStore.getState().windowsPerBlock).toBe(5);
        expect(windowButtons()[4].getAttribute('aria-checked')).toBe('true');

        act(() => lookButtons()[2].click());
        expect(useLibraryWallLookStore.getState().look).toBe('clear');
        expect(windowButtons()).toEqual([]);

        act(() => lookButtons()[0].click());
        expect(useLibraryWallLookStore.getState().look).toBe('solid');
        expect(windowButtons()).toEqual([]);

        act(() => lookButtons()[1].click());
        expect(windowButtons().find(button => button.getAttribute('aria-checked') === 'true')?.dataset.libraryWallWindows).toBe('5');
    });
});
