import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SmartRule } from '../model/smartPlaylists';

// src/library/core/state/useLibraryOrganization.ts
export type LibrarySortKey = 'source' | 'recent_collect' | 'recent_play' | 'name' | 'count' | 'updated' | 'manual';
export type CollectionOrganization = { pinned?: boolean; group?: string; order?: number };
type Store = {
    source: string; layout: 'list' | 'grid'; sort: LibrarySortKey;
    groupByPlatform: boolean; platformOrder: string[];
    collapsedGroups: Record<string, boolean>;
    rules: SmartRule[]; collections: Record<string, CollectionOrganization>;
    patch: (value: Partial<Pick<Store, 'source' | 'layout' | 'sort' | 'groupByPlatform' | 'platformOrder'>>) => void;
    toggleGroup: (groupId: string) => void;
    setAllGroupsCollapsed: (groupIds: string[], collapsed: boolean) => void;
    saveRule: (rule: SmartRule) => void; removeRule: (id: string) => void;
    organize: (key: string, value: CollectionOrganization) => void;
};
export const useLibraryOrganization = create<Store>()(persist(set => ({
    source: 'all', layout: 'list', sort: 'source', groupByPlatform: true, platformOrder: [], collapsedGroups: {}, rules: [], collections: {},
    patch: value => set(value),
    toggleGroup: groupId => set(state => ({
        collapsedGroups: { ...state.collapsedGroups, [groupId]: !state.collapsedGroups[groupId] },
    })),
    setAllGroupsCollapsed: (groupIds, collapsed) => set(state => {
        const next = { ...state.collapsedGroups };
        for (const id of groupIds) next[id] = collapsed;
        return { collapsedGroups: next };
    }),
    saveRule: rule => set(state => ({ rules: [...state.rules.filter(item => item.id !== rule.id), {
        ...rule, name: rule.name.trim().slice(0, 80), limit: Math.min(1000, Math.max(1, rule.limit || 30)),
        conditions: rule.conditions.slice(0, 20), updatedAt: Date.now(),
    }].slice(-100) })),
    removeRule: id => set(state => ({ rules: state.rules.filter(rule => rule.id !== id) })),
    organize: (key, value) => set(state => ({ collections: { ...state.collections,
        [key]: { ...state.collections[key], ...value } } })),
}), { name: 'tingyu_library_organization_v1', version: 1 }));

/** Organization keys include account identity; private folders never leak across logins. */
export const collectionOrganizationKey = (provider: string, account: string, type: string, id: string | number) =>
    JSON.stringify([provider, account, type, String(id)]);
