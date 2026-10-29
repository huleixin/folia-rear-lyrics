// src/services/lxSource/prematureEnd.ts
// A custom source URL can expire (or its stream can be clipped) well before the catalog
// duration. Renew only when playback really advanced since the previous renewal, so a
// genuinely one-minute file cannot make the queue loop on its last seconds.
export const shouldRenewPrematureLxEnd = (options: {
    lxSelected: boolean;
    expectedDurationSec: number;
    endedAtSec: number;
    retryKey: string;
    lastRenewedAtSec?: number;
}) => options.lxSelected && Boolean(options.retryKey)
    && options.expectedDurationSec > 20
    && options.endedAtSec >= 20
    && options.endedAtSec < options.expectedDurationSec - 10
    && (options.lastRenewedAtSec === undefined || options.endedAtSec >= options.lastRenewedAtSec + 15);
