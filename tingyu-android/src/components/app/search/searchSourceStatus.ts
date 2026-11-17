import type { TFunction } from 'i18next';
import type { SourcePages } from '../../../services/search/aggregateSearch';
import type { PageSection } from '../../../types/nativePages';

// src/components/app/search/searchSourceStatus.ts
/** Only expose safe status text; provider errors may contain private request details. */
export function searchSourceStatus(pages: SourcePages<unknown> | undefined, label: (id: string) => string, t: TFunction): PageSection | null {
    const sources = Object.entries(pages ?? {});
    if (!sources.length) return null;
    return { id: 'sourceStatus', layout: 'chips', items: sources.map(([id, page]) => ({
        id, title: label(id) + ' · ' + t(page.status === 'loading' ? 'searchSettings.sourceLoading'
            : page.status === 'error' ? 'searchSettings.sourceFailed' : 'searchSettings.sourceCount', { count: page.items.length }),
    })) };
}
