import { useEffect, useState } from 'react';
import { LISTENING_STATISTICS_CHANGED, readListeningSessions } from '../../../services/listeningStatistics';
import type { ListeningSessionRecord } from '../../../types/listeningStatistics';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { libraryScope } from '../services/unifiedLibrarySource';
import { listeningRange, type ListeningRange } from '../model/listeningRange';

// src/library/core/bindings/useListeningRangeData.ts
const empty = { key: '', records: [] as ListeningSessionRecord[], truncated: false, error: false };
/** Query the selected date interval first; recent sessions cannot hide an older requested period. */
export function useListeningRangeData(source: string, owner: string, active: boolean, range: ListeningRange,
    custom: { from: string; to: string }) {
    const [revision, setRevision] = useState(0), [snapshot, setSnapshot] = useState(empty);
    const accounts = useOnlineProviderAccountStore(state => state.accounts);
    const day = new Date().toLocaleDateString('sv-SE');
    const accountHydration = source === 'local' ? [] : source === 'all'
        ? Object.entries(accounts).map(([id, account]) => [id, account.hydration, account.status, account.user?.id])
        : [[source, accounts[source]?.hydration ?? 'loading', accounts[source]?.status, accounts[source]?.user?.id]];
    const key = JSON.stringify([source, owner, range, custom.from, custom.to, day, revision, accountHydration]);
    useEffect(() => {
        if (!active) return;
        const refresh = () => setRevision(value => value + 1);
        window.addEventListener(LISTENING_STATISTICS_CHANGED, refresh);
        return () => window.removeEventListener(LISTENING_STATISTICS_CHANGED, refresh);
    }, [active]);
    useEffect(() => {
        if (!active) return;
        let stale = false;
        const bounds = listeningRange(range, Date.now(), custom);
        if (!bounds) { setSnapshot({ ...empty, key }); return; }
        // Wait for account persistence hydration so an unopened store is never shown as an empty history.
        if (accountHydration.some(([, hydration]) => hydration !== 'ready')) return;
        const ids = source === 'all' ? Object.keys(accounts) : source === 'local' ? [] : [source];
        const scopes = ids.map(id => [id, libraryScope(id)] as const);
        const valid = () => !stale && scopes.every(([id, scope]) => JSON.stringify(libraryScope(id)) === JSON.stringify(scope));
        const accountIds = new Map(scopes.flatMap(([id, scope]) => scope.ready && scope.authenticated && scope.userId != null
            ? [[id, String(scope.userId)] as const] : []));
        void readListeningSessions(bounds.from, bounds.to, 50_001, record => record.providerId === 'local'
            ? source === 'all' || source === 'local'
            : (accountIds.get(record.providerId) ?? 'anonymous') === record.accountKey)
            .then(records => { if (valid()) setSnapshot({ key, records: records.slice(0, 50_000), truncated: records.length > 50_000, error: false }); })
            .catch(() => { if (valid()) setSnapshot({ ...empty, key, error: true }); });
        return () => { stale = true; };
    }, [active, key]);
    return { ...(active && snapshot.key === key ? snapshot : empty), loading: active && snapshot.key !== key,
        retry: () => setRevision(value => value + 1) };
}
