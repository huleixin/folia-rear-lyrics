import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const discoveryModules = ['roam', 'shortcuts', 'radars', 'songs', 'collections', 'recent', 'playlists'] as const;
export type DiscoveryModule = typeof discoveryModules[number];
export type DiscoverySettings = {
    source: string; enabled: Record<string, boolean>; weights: Record<string, number>; includeLocal: boolean;
    exploration: number; crossArtist: number; familiarity: number; record: boolean;
    modules: DiscoveryModule[]; hidden: DiscoveryModule[];
};
export const defaultDiscoverySettings: DiscoverySettings = { source: 'all', enabled: {}, weights: {}, includeLocal: true,
    exploration: .2, crossArtist: .3, familiarity: .5, record: true, modules: [...discoveryModules], hidden: [] };
type Store = DiscoverySettings & { patch: (patch: Partial<DiscoverySettings>) => void; reset: () => void };
export const useDiscoverySettingsStore = create<Store>()(persist(set => ({
    ...defaultDiscoverySettings, patch: patch => set(patch), reset: () => set(defaultDiscoverySettings),
}), { name: 'tingyu_discovery_settings_v1', version: 1 }));
