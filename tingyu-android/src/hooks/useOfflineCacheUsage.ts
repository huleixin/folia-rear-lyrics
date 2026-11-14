import { useEffect } from 'react';

// Refresh the existing storage totals only when native committed cache usage changes.
export function useOfflineCacheUsage(visible: boolean, refresh: () => Promise<void>) {
    useEffect(() => {
        if (!visible) return;
        const changed = () => { void refresh(); };
        window.addEventListener('tingyu-offline-cache-usage', changed);
        return () => window.removeEventListener('tingyu-offline-cache-usage', changed);
    }, [visible, refresh]);
}
