// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import LxManagerControls from '@/components/audio-tools/LxManagerControls';
import { useLxSourceStore } from '@/stores/useLxSourceStore';
import { captureSemanticSettings } from '@/services/nativeSettingsSemantic';
import type { SettingsLayoutNode } from '@/types/settingsLayout';

// test/unit/services/lxRoutingControls.test.ts
// Exercise the native action -> original React callback -> persisted routing policy.
const layoutText = (node: SettingsLayoutNode): string => [node.text ?? '', ...(node.children ?? []).map(layoutText)].join(' ');
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });
it('selects and persists both priorities through native semantic action rows', async () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    useLxSourceStore.getState().setPolicy({ routing: 'lx-first' });
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(LxManagerControls, {
        busy: false, selected: null, onInstall: async () => {}, onError: vi.fn(), onBusyChange: vi.fn(), onSelect: vi.fn(),
    })));
    try {
        for (const [label, routing] of [['原平台优先', 'original-first'], ['优先使用自定义音源', 'lx-first']]) {
            const capture = captureSemanticSettings(host, 'lx', '音源');
            const node = capture.document.flow!.nodes.find(n => n.title === label)!;
            expect(node.kind).toBe('action');
            await act(async () => capture.actions[`act:${node.id}`]({}));
            expect(useLxSourceStore.getState().policy.routing).toBe(routing);
            expect(JSON.parse(localStorage.getItem('tingyu_lx_sources_v1')!).policy.routing).toBe(routing);
            expect(host.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-pressed')).toBe('true');
            const selected = captureSemanticSettings(host, 'lx', '音源').document.flow!;
            expect(selected.nodes.find(n => n.title === label)).toMatchObject({ detail: '✓' });
            expect(selected.nodes.filter(n => n.detail === '✓')).toHaveLength(1);
            expect(layoutText(selected.layout!)).not.toContain('✓');
            expect(host.querySelector('.ty-lx-routing')!.textContent!.match(/✓/g)).toHaveLength(1);
        }
    } finally { await act(async () => root.unmount()); }
});
