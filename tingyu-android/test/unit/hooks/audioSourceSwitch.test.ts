// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useAudioQualitySwitch } from '@/hooks/useAudioQualitySwitch';
import { useLxSourceStore } from '@/stores/useLxSourceStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAudioToolsStore } from '@/stores/useAudioToolsStore';
import type { OnlineRecoveryOptions, OnlineRecoveryResult } from '@/types/playbackFailure';
import { PlayerState, type SongResult } from '@/types';

// test/unit/hooks/audioSourceSwitch.test.ts
it('switches a restored online track only on source selection changes, preserving paused intent', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const lx = useLxSourceStore.getState(), playback = usePlaybackStore.getState(), tools = useAudioToolsStore.getState();
    const recover = vi.fn<(options:OnlineRecoveryOptions)=>Promise<OnlineRecoveryResult>>(async () => ({ status: 'recovered' as const }));
    function Probe() { useAudioQualitySwitch(recover); return null; }
    const host = document.createElement('div'), root = createRoot(host);
    usePlaybackStore.setState({ currentSong: { id: '1', sourceRef: { kind: 'online', providerId: 'qq', mediaId: '1' } } as SongResult, playerState: PlayerState.PAUSED });
    useAudioToolsStore.setState({ request: null });
    try {
        await act(async () => root.render(h(Probe))); expect(recover).not.toHaveBeenCalled();
        await act(async () => useLxSourceStore.setState({ activeId: 'chosen', revision: lx.revision + 1 }));
        expect(recover).toHaveBeenCalledOnce(); expect(recover.mock.calls[0][0]).toMatchObject({ autoplay: false, bypassMediaCache: true, force: true });
        await act(async () => useLxSourceStore.setState({ open: true })); expect(recover).toHaveBeenCalledOnce();
        usePlaybackStore.setState({ currentSong: { id: 'local', sourceRef: { kind: 'local', mediaId: 'local' } } as SongResult });
        await act(async () => useLxSourceStore.setState({ activeId: null, revision: lx.revision + 2 })); expect(recover).toHaveBeenCalledOnce();
    } finally { await act(async () => root.unmount()); useLxSourceStore.setState(lx); usePlaybackStore.setState(playback); useAudioToolsStore.setState(tools); }
});
