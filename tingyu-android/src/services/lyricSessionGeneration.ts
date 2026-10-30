// src/services/lyricSessionGeneration.ts
// One monotonic counter for every lyric timeline the app publishes.
//
// Consumers use the generation to reject stale payloads. Priming an upcoming track's lyrics
// before it plays and then republishing them from the player screen are two writers of the same
// channel, so they must not each keep their own counter: a primed track with a lower generation
// than the track before it would look stale to the consumer and the island would stay empty
// exactly when the pre-fetched timeline was supposed to take over instantly.
let generation = 0;

export const nextColorOsGeneration = (): number => {
    generation += 1;
    return generation;
};

export const currentColorOsGeneration = (): number => generation;
