import {afterEach,describe,expect,it,vi} from 'vitest';
const discovery=vi.hoisted(()=>vi.fn());
vi.mock('../../../src/services/onlineMusic/omni',()=>({omni:{getSearchDiscovery:discovery}}));
import {loadSearchDiscovery} from '../../../src/components/app/search/SearchLanding';
// A stuck hot-search request must release its pending slot so Retry can recover.
afterEach(()=>vi.useRealTimers());
describe('search discovery budget',()=>{
    it('times out, retries, and prevents the stale response from replacing fresh data',async()=>{
        vi.useFakeTimers();
        let finish!:(value:any)=>void;
        discovery.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
        const failed=expect(loadSearchDiscovery('qq')).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(8000);await failed;
        discovery.mockResolvedValueOnce({suggestions:[],hot:['fresh']});
        expect((await loadSearchDiscovery('qq')).hot).toEqual(['fresh']);
        finish({suggestions:[],hot:['stale']});await Promise.resolve();
        expect((await loadSearchDiscovery('qq')).hot).toEqual(['fresh']);
    });
});
