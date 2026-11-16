let listener: (() => void) | null = null;
let pending = false;
/** The recommendation page owns the native settings sheet; commands only ask it to open. */
export function bindDiscoverySettingsPanel(next: () => void) {
    listener = next;
    if (pending) { pending = false; next(); }
    return () => { if (listener === next) listener = null; };
}
export function requestDiscoverySettingsPanel() {
    if (!listener) { pending = true; return false; }
    listener();
    return true;
}
