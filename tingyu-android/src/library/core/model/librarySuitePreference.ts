// src/library/core/model/librarySuitePreference.ts
// Android gets its own choice so the lightweight shell does not overwrite a desktop preference.
export function librarySuitePreference(android: boolean) {
    return { storageKey: android ? 'library_mobile_suite' : 'library_suite', initial: android ? 'mobile' : null };
}
