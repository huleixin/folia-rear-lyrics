import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appDatabase } from '../../../src/services/appDatabase';
import { clearListeningStatistics, readListeningSessions, storeListeningSession, summarizeListening } from '../../../src/services/listeningStatistics';
import type { ListeningSessionRecord } from '../../../src/types/listeningStatistics';

// test/unit/services/listeningStatistics.test.ts
const record: ListeningSessionRecord = { id:'session', songKey:'local:1', providerId:'local', accountKey:'device',
    startedAt:100000, endedAt:160000, seconds:60, completed:false,
    song:{ id:'1',name:'Song',artists:[{id:1,name:'Artist'}],album:{id:1,name:'Album'},durationMs:200000,
        sourceRef:{kind:'local',mediaId:'1'} } };
afterEach(async () => { await appDatabase.delete(); });
beforeEach(async () => { await appDatabase.open(); });
describe('listening statistics persistence', () => {
    it('settles an identical session once and distinguishes plays from songs', async () => {
        await Promise.all([storeListeningSession(record),storeListeningSession(record)]);
        await storeListeningSession({...record,id:'second'});
        const records = await readListeningSessions(0,200000);
        expect(records).toHaveLength(2);
        expect(summarizeListening([...records,records[0]])).toMatchObject({plays:2,songs:1,seconds:120,artists:1,albums:1});
    });
    it('rejects invalid and short duration records without estimating from song duration', async () => {
        await storeListeningSession({...record,seconds:NaN});
        await storeListeningSession({...record,seconds:5});
        expect(await readListeningSessions(0,200000)).toEqual([]);
    });
    it('clearing new statistics preserves preferences, original history and other private data', async () => {
        await appDatabase.session.put({liked:true},'preferences');
        await appDatabase.local_play_history.put({songId:'1',playCount:3,firstPlayedAt:1,lastPlayedAt:10});
        await storeListeningSession(record); await clearListeningStatistics();
        expect(await readListeningSessions(0,200000)).toEqual([]);
        expect(await appDatabase.session.get('preferences')).toEqual({liked:true});
        expect((await appDatabase.local_play_history.get('1'))?.playCount).toBe(3);
    });
    it('clear invalidates a pending settlement', async () => {
        const write=storeListeningSession(record); const clear=clearListeningStatistics();
        await Promise.all([write,clear]); expect(await readListeningSessions(0,200000)).toEqual([]);
    });
});

