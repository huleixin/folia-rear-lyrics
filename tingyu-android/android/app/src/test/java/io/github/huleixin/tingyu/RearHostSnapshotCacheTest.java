package io.github.huleixin.tingyu;

import org.json.JSONObject;
import org.junit.Test;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearHostSnapshotCacheTest.java
public class RearHostSnapshotCacheTest {
    private static JSONObject packet(int revision,String song)throws org.json.JSONException{return new JSONObject().put("revision",revision).put("owner",new JSONObject().put("songKey",song).put("epoch",song));}
    @Test public void keepsFullAppearanceButDoesNotSendItWithEveryClock()throws Exception{
        AtomicInteger reads=new AtomicInteger();
        RearHostSnapshotCache cache=new RearHostSnapshotCache(revision->{reads.incrementAndGet();JSONObject p=packet(1,"A");if(revision!=1)p.put("config",new JSONObject().put("asset","x".repeat(100000)));return p.toString();});
        assertTrue(new JSONObject(cache.get(-1,0)).has("config"));
        for(int at=100;at<30000;at+=100)assertFalse(new JSONObject(cache.get(1,at)).has("config"));
        assertEquals(30,reads.get());assertTrue(new JSONObject(cache.get(-1,30001)).has("config"));
    }
    @Test public void invalidationShowsTheNewSongWithoutWaitingForTheCalibration()throws Exception{
        String[] song={"A"};AtomicInteger reads=new AtomicInteger();
        RearHostSnapshotCache cache=new RearHostSnapshotCache(revision->{reads.incrementAndGet();return packet(1,song[0]).toString();});
        cache.get(1,0);song[0]="B";cache.invalidate();
        assertEquals("B",new JSONObject(cache.get(1,1)).getJSONObject("owner").getString("songKey"));
        cache.get(1,2);assertEquals(2,reads.get());
    }
    @Test public void discardsAReadThatRacedWithAnIdentityChange()throws Exception{
        RearHostSnapshotCache[] cache=new RearHostSnapshotCache[1];AtomicInteger reads=new AtomicInteger();
        cache[0]=new RearHostSnapshotCache(revision->{if(reads.incrementAndGet()==1){cache[0].invalidate();return packet(1,"A").toString();}return packet(1,"B").toString();});
        assertEquals("B",new JSONObject(cache[0].get(1,0)).getJSONObject("owner").getString("songKey"));assertEquals(2,reads.get());
    }
    @Test public void unstableReadsAreBoundedAndNeverAccepted()throws Exception{
        RearHostSnapshotCache[] cache=new RearHostSnapshotCache[1];AtomicInteger reads=new AtomicInteger();
        cache[0]=new RearHostSnapshotCache(revision->{reads.incrementAndGet();cache[0].invalidate();return packet(1,"old").toString();});
        try{cache[0].get(1,0);fail();}catch(IllegalStateException expected){assertEquals(2,reads.get());}
    }
    @Test public void aNewAppearanceRevisionReachesTheNextReader()throws Exception{
        int[] rev={1};RearHostSnapshotCache cache=new RearHostSnapshotCache(known->packet(rev[0],"B").put("config",new JSONObject().put("theme","rear-"+rev[0])).toString());
        cache.get(-1,0);rev[0]=2;cache.invalidate();
        assertEquals("rear-2",new JSONObject(cache.get(1,50)).getJSONObject("config").getString("theme"));
    }
}
