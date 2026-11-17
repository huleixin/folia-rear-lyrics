// src/library/core/model/listeningRange.ts
export type ListeningRange = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';
/** Calendar boundaries use the device time zone; the end is exclusive. */
export function listeningRange(range: ListeningRange, now = Date.now(), custom?: { from: string; to: string }) {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    if (range === 'all') return { from: 0, to: now + 1 };
    if (range === 'week') start.setDate(start.getDate() - 6);
    if (range === 'month') start.setDate(start.getDate() - 29);
    if (range === 'year') start.setMonth(0, 1);
    if (range === 'custom') {
        const from = parseDay(custom?.from), end = parseDay(custom?.to);
        if (!from || !end || from > end) return null;
        end.setDate(end.getDate() + 1);
        return { from: from.getTime(), to: end.getTime() };
    }
    return { from: start.getTime(), to: now + 1 };
}

/** Generate continuous local calendar YYYY-MM-DD keys for the range (no skipping empty days). */
export function calendarDaysInRange(range: ListeningRange, now = Date.now(), firstRecordAt?: number | null): string[] {
    const bounds = listeningRange(range, now);
    if (!bounds) return [];
    const startMs = range === 'all'
        ? (firstRecordAt && firstRecordAt > 0 ? firstRecordAt : now - 29 * 86_400_000)
        : bounds.from;
    const cursor = new Date(startMs);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    const days: string[] = [];
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard < 400) {
        days.push(cursor.toLocaleDateString('sv-SE'));
        cursor.setDate(cursor.getDate() + 1);
        guard++;
    }
    return days;
}
export function parseDay(value?: string): Date | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + 'T00:00:00');
    return Number.isFinite(date.getTime()) && date.getFullYear() === Number(value.slice(0,4))
        && date.getMonth() + 1 === Number(value.slice(5,7)) && date.getDate() === Number(value.slice(8,10)) ? date : null;
}
