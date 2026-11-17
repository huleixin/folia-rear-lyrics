import { useSyncExternalStore } from 'react';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { useSearchSettingsStore } from '../../../stores/useSearchSettingsStore';
import { omni } from '../../../services/onlineMusic/omni';
import { searchAuxiliaryKey } from '../../../services/search/searchAuxiliary';
import type { SearchSource } from '../../../stores/useSearchNavigationStore';

// src/components/app/search/useSearchAuxiliaryKey.ts
const subscribe = (listener: () => void) => {
    const cleanups = [useOnlineProviderAccountStore.subscribe(listener), useSearchSettingsStore.subscribe(listener), omni.subscribeProviders(listener)];
    return () => cleanups.forEach(cleanup => cleanup());
};
export function useSearchAuxiliaryKey(source: SearchSource, kind: 'suggest' | 'discovery'): string {
    return useSyncExternalStore(subscribe, () => searchAuxiliaryKey(source, kind), () => '');
}
