import { describe, expect, it } from 'vitest';
import { listeningRange } from '../../../src/library/core/model/listeningRange';

// test/unit/library/listeningRange.test.ts
const now = new Date(2026, 10, 17, 15, 20).getTime();
describe('calendar listening ranges', () => {
    it('uses local day, Monday week, calendar month and year boundaries', () => {
        expect(listeningRange('today', now)).toEqual({ from: new Date(2026, 10, 17).getTime(), to: now + 1 });
        expect(listeningRange('week', now)?.from).toBe(new Date(2026, 10, 16).getTime());
        expect(listeningRange('month', now)?.from).toBe(new Date(2026, 10, 1).getTime());
        expect(listeningRange('year', now)?.from).toBe(new Date(2026, 0, 1).getTime());
    });
    it('includes the entire final selected day and respects leap years', () => {
        expect(listeningRange('custom', now, { from: '2024-02-29', to: '2024-02-29' }))
            .toEqual({ from: new Date(2024, 1, 29).getTime(), to: new Date(2024, 2, 1).getTime() });
    });
    it('rejects normalized invalid dates, reversed ranges and incomplete input', () => {
        for (const from of ['2025-02-29', '2026-02-30', '2026-13-01', '', '2026-1-01']) {
            expect(listeningRange('custom', now, { from, to: '2026-12-31' })).toBeNull();
        }
        expect(listeningRange('custom', now, { from: '2026-11-18', to: '2026-11-17' })).toBeNull();
    });
});
