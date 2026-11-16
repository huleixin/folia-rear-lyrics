import type { SongResult } from '../types';

// src/types/listeningStatistics.ts
/** Settled, qualified S1 sessions only; old start events never become estimated durations. */
export interface ListeningSessionRecord {
    id: string;
    songKey: string;
    providerId: string;
    accountKey: string;
    startedAt: number;
    endedAt: number;
    seconds: number;
    completed: boolean;
    song: SongResult;
}
