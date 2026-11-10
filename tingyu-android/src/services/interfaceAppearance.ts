import {interfaceThemes,resolveInterfaceTheme,type InterfaceThemeId} from '../theme/interfaceThemes.generated';
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

// src/services/interfaceAppearance.ts — semantic bridge values, resolved from the shared registry.
export function interfaceUiTokens(style: InterfaceThemeId = 'classic', light = true) {
    const web = interfaceThemes[resolveInterfaceTheme(style)][light ? 'light' : 'dark'].web;
    return {
        '--ui-bg': web['--it-ui-bg'],
        '--ui-surface': web['--it-ui-surface'],
        '--ui-sheet': web['--it-ui-sheet'],
        '--ui-line': web['--it-ui-line'],
        '--ui-ink': web['--it-ui-ink'],
        '--ui-muted': web['--it-ui-muted'],
        '--ui-accent': web['--it-ui-accent'],
        '--ui-selected': web['--it-ui-selected'],
    };
}
