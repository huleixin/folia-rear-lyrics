// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import PlaybackEngineTestSettings from '@/components/modal/settings/PlaybackEngineTestSettings';
import { usePlaybackEngineTestStore } from '@/stores/usePlaybackEngineTestStore';
import { captureSemanticSettings } from '@/services/nativeSettingsSemantic';
import type { SettingsLayoutNode } from '@/types/settingsLayout';

// test/unit/services/playbackEngineSettingsSelection.test.ts
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/services/playbackEngineTest', () => ({
    canSelectPlaybackEngine: () => true, canUsePlaybackEngineTest: () => false,
    applyPlaybackEngine: vi.fn(), exportPlaybackTestLog: vi.fn(), loadPlaybackTestTone: vi.fn(),
}));
vi.mock('@/components/modal/settings/GraphicsDiagnosticsSettings', () => ({ default: () => null }));
const layoutText = (node: SettingsLayoutNode): string => [node.text ?? '', ...(node.children ?? []).map(layoutText)].join(' ');
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

it('carries one native selection check and clean accessible engine labels after either choice', async () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    usePlaybackEngineTestStore.setState({ selected: 'media3' });
    const host = document.createElement('main'); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(PlaybackEngineTestSettings, { settingsCardClass: '' })));
    try {
        for (const [engine, label] of [['web', 'playbackEngine.compatible'], ['media3', 'playbackEngine.native']] as const) {
            const capture = captureSemanticSettings(host, 'playback', '播放控制');
            const node = capture.document.flow!.nodes.find(n => n.title === label)!;
            await act(async () => capture.actions[`act:${node.id}`]({}));
            expect(usePlaybackEngineTestStore.getState().selected).toBe(engine);
            const selected = captureSemanticSettings(host, 'playback', '播放控制').document.flow!;
            expect(selected.nodes.find(n => n.title === label)).toMatchObject({ detail: '✓' });
            expect(selected.nodes.filter(n => n.detail === '✓')).toHaveLength(1);
            expect(layoutText(selected.layout!)).not.toContain('✓');
            expect(host.querySelector('[role="radiogroup"]')!.textContent!.match(/✓/g)).toHaveLength(1);
            expect(host.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-checked')).toBe('true');
        }
    } finally { await act(async () => root.unmount()); }
});
