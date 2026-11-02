import {it,expect,vi,afterEach} from 'vitest';
import {createRearLyricsTransport} from '@/services/rearLyricsTransport';
import type {RearStateSnapshot} from '@/services/rearStateRelay';

// test/unit/services/rearOutputOwnership.test.ts
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function harness(){
    vi.useFakeTimers();vi.stubGlobal('window',Object.assign(new EventTarget(),{setTimeout,clearTimeout}));
    vi.stubGlobal('Image',function(){return{set src(_value:string){}};});
    let receive!:(s:RearStateSnapshot)=>void;
    const config=vi.fn(),clock=vi.fn();
    const stop=createRearLyricsTransport(()=>{},()=>{},false,{receiveSnapshots:fn=>{receive=fn;return()=>{};}}).subscribe({config,clock,audio:vi.fn(),connected:vi.fn()});
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({state:'ready',lines:[{fullText:'current'}]})})));
    return{send:async(s:any)=>{receive(s);await vi.advanceTimersByTimeAsync(0);},config,clock,stop};
}
const cfg=(key:string,session:string,epoch='')=>({activePlaybackContext:'main',playbackSongKey:key,playbackSessionId:session,playbackEpoch:epoch,hasTrack:true,song:{id:key,name:key},lyrics:{lines:[{fullText:key}]}});
const track=(key:string,session:string,epoch:string,rev:number)=>({engine:'media3',sessionId:'process',outputSessionId:session,songKey:key,epoch,eventRevision:rev,positionMs:7000,playing:true});
const webClock=()=>({playbackSessionId:'web',playbackSongKey:'B',currentTime:12,duration:100,playerState:'PLAYING',sentAtMs:Date.now(),playbackRate:1});
it('A still playing → direct playlist B compatible: ignores retained Media3 A immediately',async()=>{
    const h=harness();await h.send({revision:1,owner:track('A','native','A#1',1),track:track('A','native','A#1',1),config:cfg('A','native','A#1'),clock:webClock()});
    await h.send({revision:2,owner:{...track('B','web','B#2',2),engine:'compatible'},track:track('A','native','A#1',1),config:cfg('B','web'),clock:webClock()});
    expect(h.config.mock.lastCall?.[0].song.id).toBe('B');expect(h.clock.mock.lastCall?.[0].currentTime).toBe(12);h.stop();
});
it('valid native B wins over a fresh wrong-song JS A and recovers the render binding',async()=>{
    const h=harness();await h.send({revision:1,owner:track('B','native','B#2',2),track:track('B','native','B#2',2),config:cfg('A','old','A#1'),clock:webClock()});
    expect(h.config.mock.lastCall?.[0].song.id).toBe('B');expect(h.clock.mock.lastCall?.[0].currentTime).toBe(7);h.stop();
});
it('handoff/none invalidates the old native timeline and any pending lyric callback',async()=>{
    const h=harness();let resolve!:(value:any)=>void;
    vi.mocked(fetch).mockReturnValue(new Promise(r=>resolve=r));
    await h.send({revision:1,owner:track('A','n','A#1',1),track:track('A','n','A#1',1),config:cfg('old','old'),clock:webClock()});
    await h.send({revision:2,owner:{engine:'handoff',sessionId:'process',eventRevision:2},track:null});
    expect((vi.mocked(fetch).mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
    resolve({ok:true,json:async()=>({state:'ready',lines:[{fullText:'WRONG'}]})});await vi.advanceTimersByTimeAsync(0);
    expect(h.clock.mock.lastCall?.[0].playerState).toBe('PAUSED');expect(h.config.mock.lastCall?.[0].lyrics.lines).toEqual([]);h.stop();
});
it('50 mixed native/compatible transitions keep current identities and discard late lease events',async()=>{
    const h=harness();for(let i=1;i<=50;i++){
        const key='qq:'+i,session='output:'+i,n=track(key,session,key+'#'+i,i),compatible=i%3===0;
        const config=cfg(key,session,n.epoch),clock={...webClock(),playbackSessionId:session,playbackSongKey:key,playbackEpoch:n.epoch};
        await h.send({revision:i,owner:{...n,engine:compatible?'compatible':'media3'},track:compatible?null:n,config,clock});
        expect(h.config.mock.lastCall?.[0].song.id).toBe(key);
        await h.send({revision:i,owner:track('old','retired','old#0',0),track:null,config:cfg('old','retired'),clock:webClock()});
        expect(h.config.mock.lastCall?.[0].song.id).toBe(key);
    }h.stop();
});
it('a compatible lease recovers its complete config when the correct clock arrives without another config revision',async()=>{
    const h=harness(),owner={...track('B','web','B#2',2),engine:'compatible',requestId:'new'};
    await h.send({revision:1,owner,track:null,config:cfg('B','web'),clock:{...webClock(),requestId:'old'}});
    expect(h.config.mock.lastCall?.[0].hasTrack).toBe(false);
    await h.send({revision:1,owner,track:null,clock:{...webClock(),requestId:'new'}});
    expect(h.config.mock.lastCall?.[0].song.id).toBe('B');expect(h.config.mock.lastCall?.[0].lyrics.lines[0].fullText).toBe('B');h.stop();
});
it('rapid A B C D, old events and same-song replay never restore an earlier epoch',async()=>{
    const h=harness();for(const [i,key]of ['A','B','C','D','D'].entries())await h.send({revision:i+1,owner:track(key,'n'+i,key+'#'+i,i+1),track:track(key,'n'+i,key+'#'+i,i+1),config:cfg('A','old'),clock:webClock()});
    await h.send({revision:99,owner:track('A','n0','A#0',1),track:track('A','n0','A#0',1),config:cfg('A','n0'),clock:webClock()});
    expect(h.config.mock.lastCall?.[0].song.id).toBe('D');expect(h.clock.mock.lastCall?.[0].discontinuity).toBe('native:D#4');h.stop();
});
it('visual-only revisions preserve native lyrics and position without a new lyric request',async()=>{
    const h=harness();const n=track('B','n','B#2',2);
    await h.send({revision:1,owner:n,track:n,config:cfg('old','old'),clock:webClock()});
    expect(fetch).toHaveBeenCalledTimes(1);
    await h.send({revision:2,owner:n,track:n,config:{...cfg('old','old'),visualizerMode:'monet',lyricsFontScale:1.5},clock:webClock()});
    expect(fetch).toHaveBeenCalledTimes(1);expect(h.config.mock.lastCall?.[0].song.id).toBe('B');expect(h.config.mock.lastCall?.[0].lyrics.lines).toHaveLength(1);
    expect(h.clock.mock.lastCall?.[0].currentTime).toBe(7);h.stop();
});
it('a visual edit while native lyrics are in flight does not cancel that valid lyric result',async()=>{
    const h=harness();let resolve!:(value:any)=>void;vi.mocked(fetch).mockReturnValue(new Promise(r=>resolve=r));const n=track('B','n','B#2',2);
    await h.send({revision:1,owner:n,track:n,config:cfg('old','old'),clock:webClock()});
    await h.send({revision:2,owner:n,track:n,config:{...cfg('old','old'),visualizerMode:'monet'},clock:webClock()});
    resolve({ok:true,json:async()=>({state:'ready',lines:[{fullText:'B current'}]})});await vi.advanceTimersByTimeAsync(0);
    expect(h.config.mock.lastCall?.[0].lyrics.lines[0].fullText).toBe('B current');expect(fetch).toHaveBeenCalledTimes(1);h.stop();
});
