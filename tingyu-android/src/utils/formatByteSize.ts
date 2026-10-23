// src/utils/formatByteSize.ts
// A byte count as a short human-readable size ("0 B", "512 B", "1.5 KB", "12.34 MB"), in binary
// steps of 1024 with the B/KB/MB/GB/TB labels the app already shows elsewhere.

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Formats a byte count with up to two decimals, trailing zeros dropped. A value that rounds up to
 * 1024 moves to the next unit ("1 MB", not "1024 KB"). Anything that is not a finite, non-negative
 * number renders as "—", so a missing measurement never reads as an empty directory.
 */
export const formatByteSize = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes < 0) {
        return '—';
    }
    let value = bytes;
    let unit = 0;
    while (unit < UNITS.length - 1 && Number(value.toFixed(2)) >= 1024) {
        value /= 1024;
        unit += 1;
    }
    return `${Number(value.toFixed(unit === 0 ? 0 : 2))} ${UNITS[unit]}`;
};
