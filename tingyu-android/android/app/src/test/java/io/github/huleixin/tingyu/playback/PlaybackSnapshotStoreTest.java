package io.github.huleixin.tingyu.playback;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import java.io.File;
import java.nio.file.Files;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/PlaybackSnapshotStoreTest.java
public class PlaybackSnapshotStoreTest {
    @Rule public TemporaryFolder temp=new TemporaryFolder();
    private JSONObject snapshot(int count,int current,boolean random) throws Exception {
        JSONArray rows=new JSONArray(),order=new JSONArray();
        for(int i=0;i<count;i++)rows.put(new JSONObject().put("songKey","online:qq:"+i).put("song",new JSONObject().put("id",i).put("name","T"+i)));
        for(int i=0;i<count;i++)order.put("online:qq:"+(random?count-1-i:i));
        return new JSONObject().put("v",1).put("queue",rows).put("order",order).put("currentKey",count==0?"":"online:qq:"+current)
            .put("positionMs",0).put("mode",random?"shuffle":"all").put("cleared",count==0)
            .put("origin",new JSONObject().put("playlistId","collection-100"));
    }
    @Test public void processDeathRestores100SongsAnd38thPositionWithoutReordering() throws Exception {
        File dir=temp.newFolder();PlaybackSnapshotStore store=new PlaybackSnapshotStore(dir);
        JSONObject original=snapshot(100,37,true);store.save(original,0,"");
        byte[] queueBytes=Files.readAllBytes(new File(dir,"queue.json").toPath());
        store.checkpoint("online:qq:37",123456,false,"shuffle",false);
        assertArrayEquals(queueBytes,Files.readAllBytes(new File(dir,"queue.json").toPath()));
        JSONObject recovered=new PlaybackSnapshotStore(dir).read();assertEquals("restored",recovered.getString("status"));
        JSONObject value=recovered.getJSONObject("snapshot");assertEquals(100,value.getJSONArray("queue").length());
        assertEquals("online:qq:37",value.getString("currentKey"));assertEquals(123456,value.getLong("positionMs"));
        assertEquals(original.getJSONArray("order").toString(),value.getJSONArray("order").toString());
        assertEquals("collection-100",value.getJSONObject("origin").getString("playlistId"));
    }
    @Test public void actualNativeTrackAndPauseReplaceTheOldJavascriptCursor() throws Exception {
        File dir=temp.newFolder();PlaybackSnapshotStore store=new PlaybackSnapshotStore(dir);
        store.save(snapshot(100,0,false),0,"");store.checkpoint("online:qq:37",81818,true,"one",false);
        JSONObject value=new PlaybackSnapshotStore(dir).read().getJSONObject("snapshot");
        assertEquals("online:qq:37",value.getString("currentKey"));assertTrue(value.getBoolean("wasPaused"));assertEquals("one",value.getString("mode"));
        try{store.save(snapshot(100,0,false),1,"online:qq:37");fail();}catch(java.io.IOException expected){assertEquals("stale-js-current",expected.getMessage());}
        assertEquals(81818,store.read().getJSONObject("snapshot").getLong("positionMs"));
    }
    @Test public void rejectsStaleRevisionDuplicatesAndFutureWritesWithoutLosingGoodData() throws Exception {
        PlaybackSnapshotStore store=new PlaybackSnapshotStore(temp.newFolder());store.save(snapshot(100,37,false),0,"");
        try{store.save(snapshot(2,0,false),0,"");fail();}catch(java.io.IOException expected){assertEquals("stale-revision",expected.getMessage());}
        JSONObject invalid=snapshot(2,0,false);invalid.getJSONArray("queue").put(invalid.getJSONArray("queue").get(0));
        try{store.save(invalid,1,"");fail();}catch(java.io.IOException expected){assertEquals("invalid-queue",expected.getMessage());}
        try{store.save(snapshot(2,0,false).put("v",99),1,"");fail();}catch(java.io.IOException expected){assertEquals("invalid-queue",expected.getMessage());}
        assertEquals(100,store.read().getJSONObject("snapshot").getJSONArray("queue").length());
    }
    @Test public void corruptPrimaryFallsBackAndBrokenAllCopiesAreSafe() throws Exception {
        File dir=temp.newFolder();PlaybackSnapshotStore store=new PlaybackSnapshotStore(dir);
        store.save(snapshot(100,37,false),0,"");store.save(snapshot(100,38,false),1,"");
        Files.writeString(new File(dir,"queue.json").toPath(),"{broken");
        assertEquals("online:qq:37",new PlaybackSnapshotStore(dir).read().getJSONObject("snapshot").getString("currentKey"));
        Files.writeString(new File(dir,"queue.bak").toPath(),"{broken");
        assertEquals("corrupt",new PlaybackSnapshotStore(dir).read().getString("status"));
    }
    @Test public void savingAfterBackupRecoveryDoesNotReplaceGoodBackupWithCorruptPrimary() throws Exception {
        File dir=temp.newFolder();PlaybackSnapshotStore store=new PlaybackSnapshotStore(dir);store.save(snapshot(100,37,false),0,"");store.save(snapshot(100,38,false),1,"");
        Files.writeString(new File(dir,"queue.json").toPath(),"{broken");
        PlaybackSnapshotStore recovered=new PlaybackSnapshotStore(dir);recovered.save(snapshot(100,39,false),1,"");
        Files.writeString(new File(dir,"queue.json").toPath(),"{broken-again");
        assertEquals("online:qq:37",new PlaybackSnapshotStore(dir).read().getJSONObject("snapshot").getString("currentKey"));
    }
    @Test public void syntacticallyValidButMissingSchemaAlsoFallsBackToLastGoodQueue() throws Exception {
        File dir=temp.newFolder();PlaybackSnapshotStore store=new PlaybackSnapshotStore(dir);store.save(snapshot(100,37,false),0,"");store.save(snapshot(100,38,false),1,"");
        Files.writeString(new File(dir,"queue.json").toPath(),"{}");
        assertEquals("online:qq:37",new PlaybackSnapshotStore(dir).read().getJSONObject("snapshot").getString("currentKey"));
    }
    @Test public void unsupportedFormatIsNotMistakenForLegacyEmptyState() throws Exception {
        File dir=temp.newFolder();Files.writeString(new File(dir,"queue.json").toPath(),snapshot(2,0,false).put("v",99).toString());
        assertEquals("unsupported",new PlaybackSnapshotStore(dir).read().getString("status"));
    }
    @Test public void clearTombstonePreventsResurrectionFromTheOldBackup() throws Exception {
        File dir=temp.newFolder();PlaybackSnapshotStore store=new PlaybackSnapshotStore(dir);store.save(snapshot(100,37,false),0,"");
        store.save(snapshot(0,0,false),1,"online:qq:37");store.checkpoint("online:qq:37",5000,false,"all",false);
        Files.writeString(new File(dir,"queue.json").toPath(),"{broken");
        PlaybackSnapshotStore restarted=new PlaybackSnapshotStore(dir);assertEquals("cleared",restarted.read().getString("status"));
        assertEquals(2,restarted.revision());restarted.save(snapshot(3,1,false),2,"");
        assertEquals("restored",new PlaybackSnapshotStore(dir).read().getString("status"));
    }
    @Test public void explicitStopSurvivesPauseSeekAndCursorCorruptionUntilRealPlay() throws Exception {
        File dir=temp.newFolder();PlaybackSnapshotStore store=new PlaybackSnapshotStore(dir);store.save(snapshot(3,1,false),0,"");
        store.checkpoint("online:qq:1",0,true,"all",true);store.checkpoint("online:qq:1",0,true,"all",false);
        Files.writeString(new File(dir,"cursor.json").toPath(),"{broken");Files.writeString(new File(dir,"cursor.bak").toPath(),"{broken");
        PlaybackSnapshotStore restarted=new PlaybackSnapshotStore(dir);assertEquals("stopped",restarted.read().getString("status"));
        restarted.checkpoint("online:qq:1",100,false,"all",false);
        assertEquals("restored",new PlaybackSnapshotStore(dir).read().getString("status"));
    }
    @Test public void delayedJsSaveCannotReplaceDeterminedNativeShuffleOrder() throws Exception {
        File dir=temp.newFolder();PlaybackSnapshotStore store=new PlaybackSnapshotStore(dir);JSONObject value=snapshot(5,2,true);
        store.nativeOrder(new JSONArray("[\"online:qq:2\",\"online:qq:4\",\"online:qq:0\"]"),"shuffle");store.save(value,0,"online:qq:2");
        JSONObject result=new PlaybackSnapshotStore(dir).read().getJSONObject("snapshot");
        assertEquals("[\"online:qq:3\",\"online:qq:1\",\"online:qq:2\",\"online:qq:4\",\"online:qq:0\"]",result.getJSONArray("order").toString());
        store.checkpoint("online:qq:2",7000,true,"shuffle",false);store.mode("one");
        assertEquals("one",new PlaybackSnapshotStore(dir).read().getJSONObject("snapshot").getString("mode"));
    }
    @Test public void stopBeforeFirstQueueCommitRejectsAnInFlightOldSave() throws Exception {
        File dir=temp.newFolder();PlaybackSnapshotStore store=new PlaybackSnapshotStore(dir);
        store.checkpoint("online:qq:1",0,true,"all",true);
        assertEquals("cleared",new PlaybackSnapshotStore(dir).read().getString("status"));
        try{store.save(snapshot(2,1,false),0,"online:qq:1");fail();}catch(java.io.IOException expected){assertEquals("stale-revision",expected.getMessage());}
    }
    @Test public void shuffleLoopFlagPersistsOnNativeModeChange() throws Exception {
        File dir=temp.newFolder();PlaybackSnapshotStore store=new PlaybackSnapshotStore(dir);store.save(snapshot(3,1,false),0,"");
        store.mode("shuffle",false);JSONObject result=new PlaybackSnapshotStore(dir).read().getJSONObject("snapshot");
        assertEquals("shuffle",result.getString("mode"));assertEquals("off",result.getString("loopMode"));
    }
    @Test public void wrongQueueCursorAndUncommittedTempCannotOverwriteCurrent() throws Exception {
        File dir=temp.newFolder();PlaybackSnapshotStore store=new PlaybackSnapshotStore(dir);store.save(snapshot(2,1,false),0,"");
        store.checkpoint("online:qq:1",12000,false,"all",false);store.save(snapshot(2,0,false),1,"");
        Files.writeString(new File(dir,"queue.tmp").toPath(),snapshot(20,9,true).toString());
        JSONObject recovered=new PlaybackSnapshotStore(dir).read().getJSONObject("snapshot");assertEquals("online:qq:0",recovered.getString("currentKey"));assertEquals(0,recovered.getLong("positionMs"));
    }
}
