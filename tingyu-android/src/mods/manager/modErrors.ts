// src/mods/manager/modErrors.ts
// Loader error codes as panel text, shared by the mod manager, its rows and the row's storage section.

/*
 * Maps a loader error code onto its localized message. Codes that have no entry
 * (a raw JS message from a mod's own failure) fall through to themselves, and
 * `value` is supplied for the messages that quote the underlying detail.
 */
export const translateModError = (
    t: (key: string, options: Record<string, unknown>) => string,
    error: string | null | undefined,
    fallbackCode: string,
): string => {
    const code = error ?? fallbackCode;
    return t(`mods.errors.${code}`, { value: code, defaultValue: code });
};
