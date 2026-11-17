import { useOnlineProviderAccountStore } from '../../stores/useOnlineProviderAccountStore';

// src/services/onlineMusic/accountActionScope.ts
// Collection/like refreshes do not end a session; logout/login does, even for the same user.
const epochs = new Map<string, number>();
useOnlineProviderAccountStore.subscribe((state, previous) => {
    for (const id of new Set([...Object.keys(state.accounts), ...Object.keys(previous.accounts)])) {
        const next = state.accounts[id], before = previous.accounts[id];
        if (next?.user?.id !== before?.user?.id || next?.status !== before?.status || next?.hydration !== before?.hydration) {
            epochs.set(id, (epochs.get(id) ?? 0) + 1);
        }
    }
});
export const accountActionEpoch = (providerId: string): number => epochs.get(providerId) ?? 0;
export function captureAccountAction(providerId: string): () => void {
    const epoch = epochs.get(providerId) ?? 0;
    return () => {
        if (epoch !== (epochs.get(providerId) ?? 0)) throw new DOMException('Music account changed', 'AbortError');
    };
}
