// src/utils/playbackMode.ts
// The four playback modes, and the mapping to the two booleans the playback kernel actually has.
//
// The kernel keeps `shuffleEnabled: boolean` and `loopMode: 'off' | 'all' | 'one'` — that pair is
// what MediaSession, the audio element's `loop` attribute and the queue advance all read, and it is
// not being replaced here. What was missing is a *name* for the combination the listener is picking
// when they press one button: the minimal page had two buttons (shuffle, repeat) that could both
// look "on" while doing something neither promised, and the stage's single button cycled three of
// the four states.
//
// One text-based source of truth:
//
//   order   → shuffle off, loop off     one pass, then stop
//   all     → shuffle off, loop all     one pass, then start over
//   one     → shuffle off, loop one     the same song
//   shuffle → shuffle on,  loop all     a pass in random order, then another
//
// `shuffle` always carries `loop: 'all'`. A shuffled queue that stops at the end of its first pass
// is not what "随机播放" means, and it is the one pairing the two states must never disagree on.

export type PlaybackMode = 'order' | 'all' | 'one' | 'shuffle';
export type LoopModeValue = 'off' | 'all' | 'one';

/** The order the single button steps through, and the order the spec asks for. */
export const PLAYBACK_MODE_ORDER: readonly PlaybackMode[] = ['order', 'all', 'one', 'shuffle'];

/** The kernel's pair, read back as the mode the button shows. */
export const resolvePlaybackMode = (
    shuffleEnabled: boolean | undefined,
    loopMode: LoopModeValue | undefined,
): PlaybackMode => {
    if (shuffleEnabled) {
        return 'shuffle';
    }
    if (loopMode === 'one') {
        return 'one';
    }
    return loopMode === 'all' ? 'all' : 'order';
};

/** The pair to write for a mode — the inverse of `resolvePlaybackMode`. */
export const resolvePlaybackModeState = (mode: PlaybackMode): {
    shuffleEnabled: boolean;
    loopMode: LoopModeValue;
} => {
    switch (mode) {
        case 'one':
            return { shuffleEnabled: false, loopMode: 'one' };
        case 'all':
            return { shuffleEnabled: false, loopMode: 'all' };
        case 'shuffle':
            return { shuffleEnabled: true, loopMode: 'all' };
        default:
            return { shuffleEnabled: false, loopMode: 'off' };
    }
};

/** The next mode the button lands on: order → all → one → shuffle → order. */
export const nextPlaybackMode = (mode: PlaybackMode): PlaybackMode =>
    PLAYBACK_MODE_ORDER[(PLAYBACK_MODE_ORDER.indexOf(mode) + 1) % PLAYBACK_MODE_ORDER.length];

/**
 * Localisation key for a mode's name. The stage already publishes these under `mobileStage` (its
 * control bar prints the name under the button), so both views read the same strings — including the
 * one legacy name: `order` is what the store's `loopMode: 'off'` means, and the string for it is
 * `mobileStage.loop_off`.
 */
export const playbackModeLabelKey = (mode: PlaybackMode): string => (
    mode === 'order' ? 'mobileStage.loop_off' : `mobileStage.loop_${mode}`
);

/**
 * The token the native control bar expects. It predates the mode union and still switches on
 * `off | all | one | shuffle`, so `order` is sent as `off` rather than renamed on both sides.
 */
export const playbackModeLegacyToken = (mode: PlaybackMode): 'off' | 'all' | 'one' | 'shuffle' => (
    mode === 'order' ? 'off' : mode
);
