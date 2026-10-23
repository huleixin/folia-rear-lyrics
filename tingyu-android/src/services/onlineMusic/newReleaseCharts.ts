import type { ProviderCollection } from '../../types/onlineMusic';
import { omni } from './omni';

// src/services/onlineMusic/newReleaseCharts.ts
export const NEW_RELEASE_FRESH_MS = 10 * 60 * 1000;
const entries = new Map<string, { expires: number; value: ProviderCollection }>();
const pending = new Map<string, Promise<ProviderCollection>>();
export async function loadNewReleaseChart(providerId: string, refresh = false): Promise<ProviderCollection> {
    const cached = entries.get(providerId);
    if (!refresh && cached && cached.expires > Date.now()) return cached.value;
    const running = pending.get(providerId);
    if (running) return running;
    const request = omni.getProviderNewReleaseCollection(providerId).then(value => {
        if (value.providerId !== providerId || !value.id || !value.name)
            throw new Error('New-release chart source identity mismatch');
        entries.set(providerId, { value, expires: Date.now() + NEW_RELEASE_FRESH_MS });
        return value;
    }).finally(() => pending.delete(providerId));
    pending.set(providerId, request);
    return request;
}
