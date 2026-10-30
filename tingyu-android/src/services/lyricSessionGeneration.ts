// src/services/lyricSessionGeneration.ts
// One monotonic counter for every lyric timeline the app publishes.
//
// Consumers use the generation to reject stale payloads. Priming an upcoming track's lyrics
// before it plays and then republishing them from the player screen are two writers of the same
// channel, so they must not each keep their own counter: a primed track with a lower generation
// than the track before it would look stale to the consumer and the island would stay empty
// exactly when the pre-fetched timeline was supposed to take over instantly.
//
// The counter is persisted. A module-level counter restarts at zero on every WebView reload -
// which is exactly what happens when Android reclaims the renderer during a long background
// session - and from then on every payload carried a generation lower than the ones the consumer
// had already accepted. Persisting it keeps the promise the field makes: never go backwards.
const STORAGE_KEY = 'tingyu.lyric.generation';

const readPersisted = (): number => {
    try {
        const stored = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
        return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
    } catch {
        return 0;
    }
};

let generation = typeof window === 'undefined' ? 0 : readPersisted();

export const nextColorOsGeneration = (): number => {
    generation += 1;
    try {
        window.localStorage.setItem(STORAGE_KEY, String(generation));
    } catch {
        // Persistence is a reload guard, not a requirement.
    }
    return generation;
};

export const currentColorOsGeneration = (): number => generation;

/** Test seam: the counter is process-wide on purpose, so a test must be able to start clean. */
export const resetColorOsGenerationForTest = (value = 0): void => {
    generation = Math.max(0, Math.floor(value));
};
