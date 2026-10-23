import { afterEach, describe, expect, it } from 'vitest';
import {
    blockLatticeNavigationInFm,
    isStartupLatticeDeferred,
    resolveStartupView,
    resolvePlayerCapsuleNavigationTarget,
    shouldNavigatePlayerBackThroughHistory,
    shouldReplacePlayerNavigation,
    type NavigationHistoryState,
} from '@/hooks/useAppNavigation';
import i18n from '@/i18n/config';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useStatusMessageStore } from '@/stores/useStatusMessageStore';

// test/unit/navigation/appNavigationHistory.test.ts
// Guards player-back behavior so collection pages are popped instead of duplicated.

const state = (
    view: NavigationHistoryState['view'],
    appHistoryIndex: number,
): NavigationHistoryState => ({
    view,
    appHistoryIndex,
    search: null,
    collection: null,
});

afterEach(() => {
    usePlaybackStore.setState({ isFmMode: false });
    useStatusMessageStore.setState({ message: null });
});

describe('player navigation history', () => {
    it('returns through browser history when the player was opened from an app page', () => {
        expect(shouldNavigatePlayerBackThroughHistory(state('player', 2))).toBe(true);
    });

    it('uses the direct-home fallback for a player startup entry', () => {
        expect(shouldNavigatePlayerBackThroughHistory(state('player', 0))).toBe(false);
    });

    it('does not treat a home entry as player back navigation', () => {
        expect(shouldNavigatePlayerBackThroughHistory(state('home', 2))).toBe(false);
    });

    it('replaces the current entry when navigating to an already active player', () => {
        expect(shouldReplacePlayerNavigation(state('player', 2))).toBe(true);
    });

    it('pushes a new entry when opening the player from home', () => {
        expect(shouldReplacePlayerNavigation(state('home', 2))).toBe(false);
    });
});

describe('Lattice navigation availability', () => {
    it('allows normal queues without emitting a toast', () => {
        usePlaybackStore.setState({ isFmMode: false });
        useStatusMessageStore.setState({ message: null });

        expect(blockLatticeNavigationInFm()).toBe(false);
        expect(useStatusMessageStore.getState().message).toBeNull();
    });

    it('blocks Personal FM and explains why in the status toast', () => {
        usePlaybackStore.setState({ isFmMode: true });
        useStatusMessageStore.setState({ message: null });

        expect(blockLatticeNavigationInFm()).toBe(true);
        expect(useStatusMessageStore.getState().message).toEqual({
            type: 'info',
            text: i18n.t('status.latticeUnavailableInFm'),
        });
    });
});

describe('startup view resolution', () => {
    const base = { openPlayerOnLaunch: true, playbackEntryView: 'player' as const, isFmMode: false, queueLength: 3 };

    it('opens home when the setting is off, whatever the entry preference is', () => {
        expect(resolveStartupView({ ...base, openPlayerOnLaunch: false, playbackEntryView: 'stay' })).toBe('home');
    });

    it('opens the player when the preference is player', () => {
        expect(resolveStartupView(base)).toBe('player');
    });

    

    it('falls back to the player in FM mode', () => {
        expect(resolveStartupView({ ...base, playbackEntryView: 'stay', isFmMode: true })).toBe('player');
    });

    it('falls back to the player on an empty queue', () => {
        expect(resolveStartupView({ ...base, playbackEntryView: 'stay', queueLength: 0 })).toBe('player');
    });
});
