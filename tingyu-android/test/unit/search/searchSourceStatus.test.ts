import { expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { searchSourceStatus } from '@/components/app/search/searchSourceStatus';

// test/unit/search/searchSourceStatus.test.ts
it('keeps partial successes while exposing no raw source errors', () => {
    const t = ((key: string, args?: {count: number}) => key + (args?.count ?? '')) as TFunction;
    const section = searchSourceStatus({
        qq: {items: ['song'], status: 'ready', offset: 1, hasMore: false, error: null},
        kugou: {items: [], status: 'error', offset: 0, hasMore: false, error: 'private-cookie'},
        netease: {items: [], status: 'loading', offset: 0, hasMore: false, error: null},
    }, id => id, t)!;
    expect(section.items?.map(item => item.title)).toEqual([
        'qq · searchSettings.sourceCount1', 'kugou · searchSettings.sourceFailed0', 'netease · searchSettings.sourceLoading0',
    ]);
    expect(JSON.stringify(section)).not.toContain('private-cookie');
    expect(searchSourceStatus(undefined, id => id, t)).toBeNull();
});
