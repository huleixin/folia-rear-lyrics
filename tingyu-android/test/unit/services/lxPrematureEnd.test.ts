import { expect, it } from 'vitest';
import { shouldRenewPrematureLxEnd } from '@/services/lxSource/prematureEnd';

// test/unit/services/lxPrematureEnd.test.ts
it('renews a custom source that ends before the catalog duration', () => {
    expect(shouldRenewPrematureLxEnd({ lxSelected: true, expectedDurationSec: 240, endedAtSec: 60, retryKey: 'song#1' })).toBe(true);
});
it('does not loop a genuinely short song or retry without progress', () => {
    expect(shouldRenewPrematureLxEnd({ lxSelected: true, expectedDurationSec: 58, endedAtSec: 58, retryKey: 'song#1' })).toBe(false);
    expect(shouldRenewPrematureLxEnd({ lxSelected: true, expectedDurationSec: 240, endedAtSec: 61, retryKey: 'song#1', lastRenewedAtSec: 60 })).toBe(false);
    expect(shouldRenewPrematureLxEnd({ lxSelected: false, expectedDurationSec: 240, endedAtSec: 60, retryKey: 'song#1' })).toBe(false);
});
it('allows another renewal after the refreshed URL played on', () => {
    expect(shouldRenewPrematureLxEnd({ lxSelected: true, expectedDurationSec: 240, endedAtSec: 120, retryKey: 'song#1', lastRenewedAtSec: 60 })).toBe(true);
});
