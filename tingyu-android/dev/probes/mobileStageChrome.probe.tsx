import React, { useMemo, useState } from 'react';
import { motionValue } from 'framer-motion';
import type { ProbeDefinition } from './definition';
import { PlayerState } from '../../src/types';
import { useSettingsModalStore } from '../../src/stores/useSettingsModalStore';
import MobileStageChrome from '../../src/components/app/overlays/mobile-stage/MobileStageChrome';
import type { AppOverlaysModel } from '../../src/components/app/overlays/buildAppOverlaysModel';

// dev/probes/mobileStageChrome.probe.tsx
function Probe() {
    const fixture = new URLSearchParams(location.search);
    const fixtureBackground = ({ light: '#ead9bd', dark: '#05120d', saturated: '#a71d69' } as Record<string, string>)[fixture.get('theme') || ''];
    const settingsState = useSettingsModalStore((value) => value.settingsModalState);
    const [state, setState] = useState(PlayerState.PLAYING);
    const [loop, setLoop] = useState<'off' | 'all' | 'one'>('off');
    const [index, setIndex] = useState(1);
    const [lastSeek, setLastSeek] = useState(0);
    const [backs, setBacks] = useState(0);
    const [daylight, setDaylight] = useState(false);
    const time = useMemo(() => motionValue(44), []);
    const controls: NonNullable<AppOverlaysModel['floatingControls']> = {
        currentSong: { name: `Track ${index}` },
        playerState: state,
        currentTime: time,
        duration: 270,
        loopMode: loop,
        currentView: 'player',
        audioSrc: 'probe://audio',
        canTogglePlay: true,
        lyrics: null,
        onSeek: (value) => {
            time.set(value);
            setLastSeek(value);
        },
        onTogglePlay: () =>
            setState((value) => (value === PlayerState.PLAYING ? PlayerState.PAUSED : PlayerState.PLAYING)),
        onToggleLoop: () => setLoop((value) => (value === 'off' ? 'all' : value === 'all' ? 'one' : 'off')),
        onNavigateToPlayer: () => {},
        isDaylight: daylight,
        slotPrimary: 'loop',
        slotSecondary: 'lyrics-timeline',
        slotContext: {
            onShuffle: () => {},
            canShuffle: false,
            onLike: () => {},
            isLiked: false,
            likeDisabled: false,
            invokeCommandById: () => {},
            canInvokeCommandById: () => true,
        },
        onCommitBottomBarOffset: () => {},
        trackNavigation: {
            currentTrackKey: String(index),
            onPrev: () => setIndex((value) => value - 1),
            onNext: () => setIndex((value) => value + 1),
            canPrev: true,
            canNext: true,
            prevTitle: 'Previous',
            nextTitle: 'Next',
            prevLabel: 'Previous track',
            nextLabel: 'Next track',
        },
    };
    if (fixtureBackground) controls.theme = {
        backgroundColor: fixtureBackground, primaryColor: '#fffdf6', accentColor: '#f3d17e',
    } as NonNullable<typeof controls.theme>;
    return (
        <div style={{ position: 'relative', height: '100dvh', background: fixtureBackground || (daylight ? '#e4d8c4' : '#283730') }}>
            <MobileStageChrome
                chrome={{
                    song: {
                        title: fixture.has('longTitle') ? 'An extremely long song title that must not displace any controls' : `Track ${index}`,
                        artist: 'Probe artist',
                        coverUrl: '/assets/mobile-home/guess-you-like.png',
                    },
                    hidden: false,
                    onBack: () => setBacks((value) => value + 1),
                }}
                controls={controls}
            />
            <output
                data-testid="stage-result"
                style={{ position: 'absolute', top: '40%', left: 20 }}
            >{`${state}:${index}:${lastSeek.toFixed(1)}:${backs}`}</output>
            <output data-testid="style-route" style={{ position: 'absolute', top: '45%', left: 20 }}>
                {`${settingsState.isOpen}:${settingsState.initialSubview}:${settingsState.initialVisualizerSection}`}
            </output>
            <button
                style={{ position: 'absolute', top: '50%', left: 20 }}
                onClick={() => setDaylight((value) => !value)}
            >
                Change fixture theme
            </button>
        </div>
    );
}
export default {
    id: 'mobileStageChrome',
    title: 'Mobile stage playback chrome',
    description: 'Playback action, seek and responsive chrome regression without changing the lyrics renderer.',
    Component: Probe,
} satisfies ProbeDefinition;
