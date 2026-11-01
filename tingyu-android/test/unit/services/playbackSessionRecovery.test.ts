import { beforeEach, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';
import { getPlaybackSongKey as key } from '@/utils/appPlaybackGuards';
import { createShufflePlayback } from '@/services/shufflePlayback';

// test/unit/services/playbackSessionRecovery.test.ts
const bridge=vi.hoisted(()=>({readPlaybackRecovery:vi.fn(),savePlaybackRecovery:vi.fn(),checkpointPlaybackRecovery:vi.fn()}));
vi.mock('@/platform/runtime',()=>({isCapacitorAndroid:()=>true}));
vi.mock('@/platform/tingyuPlayback',()=>({getTingyuPlayback:()=>bridge}));
const song=(id:number):SongResult=>({id,name:'T'+id,artists:[{id:1,name:'A'}],album:{id:8,name:'Album',coverUrl:'https://cdn.test/8.jpg'},durationMs:300000,
    sourceRef:{kind:'online',providerId:'qq',mediaId:String(id),providerData:{songMid:'mid'+id,mediaMid:'media'+id}}});
let persist:typeof import('@/services/playbackRecoverySnapshot'),recovery:typeof import('@/services/androidSessionRecovery');
beforeEach(async()=>{
    vi.resetModules();vi.clearAllMocks();persist=await import('@/services/playbackRecoverySnapshot');recovery=await import('@/services/androidSessionRecovery');
    bridge.savePlaybackRecovery.mockResolvedValue({revision:2});bridge.readPlaybackRecovery.mockResolvedValue({status:'empty',revision:0});
});
const tracks=Array.from({length:100},(_,i)=>song(i));
it('restores all 100 songs, original order and the 38th cursor, without an audio source',()=>{
    const snapshot=persist.createQueueSnapshot(tracks[37],tracks,'all',tracks.map(key),123456,{playlistId:'list-100'});
    const plan=recovery.chooseRecoveryPlan({status:'restored',revision:1,snapshot})!;
    expect(plan.queue.map(key)).toEqual(tracks.map(key));expect(key(plan.song)).toBe(key(tracks[37]));expect(plan.positionMs).toBe(123456);
    expect(plan.live).toBeUndefined();expect(plan.mode).toBe('all');expect(bridge.savePlaybackRecovery).not.toHaveBeenCalled();
});
it('retains unavailable LX platform identity and resolver metadata instead of dropping its queue',()=>{
    const lx={...tracks[37],sourceRef:{kind:'online',providerId:'lx:tx',mediaId:'mid38',providerData:{songmid:'mid38',strMediaMid:'file38'}}} as SongResult;
    const snapshot=persist.createQueueSnapshot(lx,[lx],'one',[],87000);const plan=recovery.chooseRecoveryPlan({status:'restored',revision:1,snapshot})!;
    expect(plan.song.sourceRef).toEqual(lx.sourceRef);expect(plan.queue).toHaveLength(1);expect(plan.positionMs).toBe(87000);
});
it('Media3 live track, clock and mode win over stale disk state',()=>{
    const snapshot=persist.createQueueSnapshot(tracks[0],tracks,'off',[],1000);
    for(const paused of [false,true]){
        const live={songKey:key(tracks[37]),uri:'https://ephemeral.test/stream',position:88.5,duration:300,paused};
        const plan=recovery.chooseRecoveryPlan({status:'restored',revision:1,snapshot,live,liveMode:'one'})!;
        expect(plan.song).toEqual(tracks[37]);expect(plan.positionMs).toBe(88500);expect(plan.mode).toBe('one');expect(plan.live).toBe(live);
    }
});
it('reuses live state even when disk snapshot is corrupt, without trusting its temporary URL as storage',()=>{
    const live={songKey:'online:qq:38',uri:'https://temporary.test/a',position:42,duration:300,paused:false};
    const plan=recovery.chooseRecoveryPlan({status:'corrupt',revision:0,live,liveTrack:{title:'Current',artist:'A',providerData:{mediaMid:'file38'}}})!;
    expect(key(plan.song)).toBe(live.songKey);expect(plan.song.name).toBe('Current');
    expect(JSON.stringify(persist.createQueueSnapshot(plan.song,plan.queue,'all',[],0))).not.toContain(live.uri);
});
it('recovers local live identity when no disk metadata is available',()=>{
    const plan=recovery.chooseRecoveryPlan({status:'empty',revision:0,live:{songKey:'local:stable-id',uri:'content://file',position:5,duration:20,paused:false}})!;
    expect(key(plan.song)).toBe('local:stable-id');expect((plan.song as unknown as {localRef:unknown}).localRef).toEqual({songId:'stable-id'});
});
it.each(['cleared','stopped','corrupt','unsupported'])('does not resurrect legacy queue when status is %s',status=>{
    expect(recovery.chooseRecoveryPlan({status,revision:1},{song:tracks[37],queue:tracks})).toBeNull();
});
it('migrates a legacy snapshot only when the native store really is empty',()=>{
    const plan=recovery.chooseRecoveryPlan({status:'empty',revision:0},{song:tracks[37],queue:tracks})!;
    expect(plan.queue).toHaveLength(100);expect(plan.positionMs).toBe(0);
});
it('handles missing current song, duplicate keys and bad row identities without a wrong seek',()=>{
    const snapshot=persist.createQueueSnapshot(tracks[37],tracks,'all',[],99999);
    snapshot.queue=snapshot.queue.filter(row=>row.songKey!==key(tracks[37]));snapshot.queue.push(snapshot.queue[0],{songKey:'wrong',song:tracks[1]});
    const plan=recovery.chooseRecoveryPlan({status:'restored',revision:1,snapshot})!;
    expect(key(plan.song)).toBe(key(tracks[0]));expect(plan.positionMs).toBe(0);expect(new Set(plan.queue.map(key)).size).toBe(99);
});
it('sanitizes transport URLs and secrets but keeps provider ids, artwork and local references',()=>{
    const candidate={...tracks[0],audioSrc:'https://secret.test',lyrics:{lines:['large']},sourceRef:{...tracks[0].sourceRef,providerData:{mediaMid:'file',url:'https://expiring.test',cookie:'secret',hash:'abc'}}} as unknown as SongResult;
    const value=persist.sanitizeRecoverySong(candidate);const serialized=JSON.stringify(value);
    expect(serialized).not.toMatch(/secret|expiring|lines/);expect(value.sourceRef?.kind).toBe('online');expect(value.album.coverUrl).toBe('https://cdn.test/8.jpg');
    const local={...tracks[0],sourceRef:{kind:'local',mediaId:'local-38'},isLocal:true,localRef:{songId:'local-38'}} as SongResult;
    expect(persist.sanitizeRecoverySong(local)).toMatchObject({localRef:{songId:'local-38'}});
});
it('preserves the determined shuffle order, including previous and next, without generating randomness',()=>{
    const order=[...tracks].reverse().map(key),random=vi.fn(()=>.2),shuffle=createShufflePlayback(random);shuffle.setEnabled(true);
    shuffle.restorePlan(tracks,tracks[37],order);shuffle.observe(tracks,tracks[37]);
    expect(key(shuffle.next(tracks,tracks[37])!)).toBe(key(tracks[36]));expect(key(shuffle.previous(tracks,tracks[37])!)).toBe(key(tracks[38]));
    expect(shuffle.recoveryOrder()).toEqual(order);expect(random).not.toHaveBeenCalled();
});
it('consumes a cold resume position only once and only for the same song',()=>{
    const consumed=vi.fn();recovery.armRecoveryPosition(key(tracks[37]),123456,consumed);
    expect(recovery.consumeRecoveryPosition(key(tracks[0]))).toBeNull();expect(consumed).not.toHaveBeenCalled();
    expect(recovery.consumeRecoveryPosition(key(tracks[37]))).toBe(123456);expect(consumed).toHaveBeenCalledOnce();
    expect(recovery.consumeRecoveryPosition(key(tracks[37]))).toBeNull();
});
it('discarding a cold position on manual skip prevents the next track from receiving it',()=>{
    recovery.armRecoveryPosition(key(tracks[37]),123456,()=>{});recovery.discardRecoveryPosition(key(tracks[0]));expect(recovery.hasPendingColdRecovery()).toBe(false);
});
it('holds the live queue through boot defaults; real user queue or mode changes release that hold',()=>{
    expect(persist.recoveryReady()).toBe(false);persist.finishRecovery({status:'empty',revision:0});
    persist.holdLiveQueue(tracks,key(tracks[37]),'shuffle');expect(persist.keepLiveQueue(tracks,key(tracks[37]),'shuffle')).toBe(true);
    expect(persist.keepLiveQueue(tracks,key(tracks[37]),'one')).toBe(false);
    persist.holdLiveQueue(tracks,key(tracks[37]),'all');expect(persist.keepLiveQueue([...tracks],key(tracks[37]),'all')).toBe(false);
});
it('does not send whole playlists on clock-only updates and saves with the acknowledged revision',async()=>{
    const snapshot=persist.createQueueSnapshot(tracks[37],tracks,'all',[],0);
    await persist.saveRecoverySnapshot(snapshot);expect(bridge.savePlaybackRecovery).not.toHaveBeenCalled();
    persist.finishRecovery({status:'restored',revision:1,snapshot});await persist.saveRecoverySnapshot(snapshot);
    await persist.saveRecoverySnapshot({...snapshot,positionMs:20000});expect(bridge.savePlaybackRecovery).toHaveBeenCalledTimes(1);
    await persist.checkpointRecovery(key(tracks[37]),20000,'all');expect(bridge.checkpointPlaybackRecovery).toHaveBeenCalledWith({songKey:key(tracks[37]),positionMs:20000,mode:'all'});
    await persist.saveRecoverySnapshot({...snapshot,mode:'one'});expect(bridge.savePlaybackRecovery.mock.calls[1][0].revision).toBe(2);
});
it('latest pending save wins, so a delayed old queue cannot undo a clear',async()=>{
    persist.finishRecovery({status:'empty',revision:0});const old=persist.saveRecoverySnapshot(persist.createQueueSnapshot(tracks[0],tracks,'all',[]));
    const clear=persist.saveRecoverySnapshot(persist.createQueueSnapshot(tracks[0],[],'all',[]));await Promise.all([old,clear]);
    expect(bridge.savePlaybackRecovery).toHaveBeenCalledTimes(1);expect(bridge.savePlaybackRecovery.mock.calls[0][0].snapshot.cleared).toBe(true);
});
it('save failures retain a valid native revision and allow a later explicit retry',async()=>{
    persist.finishRecovery({status:'empty',revision:0});bridge.savePlaybackRecovery.mockRejectedValueOnce(Error('stale'));
    bridge.readPlaybackRecovery.mockResolvedValue({status:'restored',revision:5});const snapshot=persist.createQueueSnapshot(tracks[0],tracks,'all',[]);
    await expect(persist.saveRecoverySnapshot(snapshot)).rejects.toThrow();await persist.saveRecoverySnapshot(snapshot);
    expect(bridge.savePlaybackRecovery.mock.calls[1][0].revision).toBe(5);
});

it('retains the whole determined shuffle cycle after more than 256 history entries',()=>{
    const large=Array.from({length:400},(_,i)=>song(i)),shuffle=createShufflePlayback(()=>.2);shuffle.setEnabled(true);
    let current=large[0];shuffle.observe(large,current);const order=shuffle.recoveryOrder();
    for(let i=0;i<300;i++){current=shuffle.next(large,current)!;shuffle.observe(large,current);}
    expect(shuffle.recoveryOrder()).toEqual(order);
    const restored=createShufflePlayback(()=>{throw Error('must not reshuffle');});restored.setEnabled(true);restored.restorePlan(large,current,order);
    expect(key(restored.next(large,current)!)).toBe(key(shuffle.next(large,current)!));
});

it('preserves shuffle loop semantics as well as the determined order',()=>{
    const snapshot=persist.createQueueSnapshot(tracks[37],tracks,'shuffle',[],0,null,'off');
    expect(recovery.chooseRecoveryPlan({status:'restored',revision:1,snapshot})!.loopMode).toBe('off');
    const live={songKey:key(tracks[37]),uri:'https://live.test',position:1,duration:300,paused:false};
    expect(recovery.chooseRecoveryPlan({status:'restored',revision:1,snapshot,live,liveMode:'shuffle',liveLoopAll:true})!.loopMode).toBe('all');
});
