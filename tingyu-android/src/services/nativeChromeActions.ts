// src/services/nativeChromeActions.ts
type Command = 'toggle' | 'previous' | 'next' | 'loop' | 'queue' | 'quality' | 'openStage';
export type ChromeActionHandlers = Partial<Record<Command, () => void>> & {
    seek?: (seconds: number) => void;
    navigate?: (tab: number) => void;
};
export function dispatchChromeAction(actions: ChromeActionHandlers, action: string, value: number): void {
    if (action === 'seek' || action === 'navigate') actions[action]?.(Number.isFinite(value) ? value : 0);
    // DOM-compatible button handlers take no synthetic number/event from the bridge.
    else actions[action as Command]?.();
}
