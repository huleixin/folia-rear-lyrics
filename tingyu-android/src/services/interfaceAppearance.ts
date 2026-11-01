// Ordinary Android chrome has its own preference. Folia's isDaylight remains a stage setting.
export type InterfaceAppearance = 'system' | 'light' | 'dark';
export const INTERFACE_APPEARANCE_KEY = 'tingyu_interface_appearance_v1';
export const INTERFACE_APPEARANCE_EVENT = 'tingyu-interface-appearance';
export function validInterfaceAppearance(value: unknown): value is InterfaceAppearance {
    return value === 'system' || value === 'light' || value === 'dark';
}
export function resolveInterfaceLight(mode: InterfaceAppearance, systemLight: boolean): boolean {
    return mode === 'system' ? systemLight : mode === 'light';
}
// Native browsing was always dark, including users whose stage was daylight/AI themed.
export function migrateInterfaceAppearance(stored: unknown, native: boolean, legacyLight: boolean): InterfaceAppearance {
    return validInterfaceAppearance(stored) ? stored : native ? 'dark' : legacyLight ? 'light' : 'dark';
}
export const lightInterfaceTokens = {
    '--ui-bg': '#f4f5ee', '--ui-surface': '#e5ede4', '--ui-sheet': '#f1f4ed',
    '--ui-line': '#315d4326', '--ui-ink': '#213e34', '--ui-muted': '#496357',
    '--ui-accent': '#246e55', '--ui-selected': '#3278561c',
} as const;
