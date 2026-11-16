import i18n from '../../i18n/config';

// src/services/onlineMusic/providerLabel.ts
/** Presentation only: provider IDs and playback identities are never translated. */
export function providerLabel(id: string, short = false, fallback = id): string {
    return String(i18n.t(`musicProviders.${id}.${short ? 'short' : 'full'}`, { defaultValue: fallback }));
}
