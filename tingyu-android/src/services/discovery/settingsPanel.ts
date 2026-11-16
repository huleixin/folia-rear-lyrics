let listener: (() => void) | null = null;
/** The recommendation page owns the native settings sheet; commands only ask it to open. */
export function bindDiscoverySettingsPanel(next: () => void) {
    listener = next;
    return () => { if (listener === next) listener = null; };
}
export function requestDiscoverySettingsPanel() {
    if (!listener) return false;
    listener();
    return true;
}
