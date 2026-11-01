package io.github.huleixin.tingyu.playback;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

// android/app/src/androidTest/java/io/github/huleixin/tingyu/playback/PlaylistResourceCacheDeviceTest.java
/** Real SQLite/JobScheduler contracts. Requires Android instrumentation; not a browser substitute. */
@RunWith(AndroidJUnit4.class)
public class PlaylistResourceCacheDeviceTest {
    @Test public void completeManifestsArePersistedInPagesWithoutTheAudioQueueWindow() throws Exception {
        PlaylistResourceCache cache=PlaylistResourceCache.get(InstrumentationRegistry.getInstrumentation().getTargetContext());
        cache.configure(false,false);
        for(int count:new int[]{30,100,396,500,1001}) {
            String token="test-"+count;
            cache.begin(token);
            for(int offset=0;offset<count;offset+=50) {
                JSONArray page=new JSONArray();
                for(int i=offset;i<Math.min(count,offset+50);i++)page.put(new JSONObject()
                    .put("songKey","test-qq:"+i).put("title","test").put("durationMs",100000)
                    .put("url","secret-audio-must-not-persist").put("providerData","cookie-must-not-persist"));
                cache.append(token,page,offset,offset+50>=count);
            }
            assertEquals(count,cache.status().getInt("total"));
            try(android.database.Cursor c=cache.getReadableDatabase().rawQuery("SELECT payload FROM tasks ORDER BY ordinal DESC LIMIT 1",null)){
                assertTrue(c.moveToFirst());
                assertFalse(c.getString(0).contains("secret-audio"));
                assertFalse(c.getString(0).contains("cookie"));
            }
        }
    }
    @Test public void staleSnapshotCannotOverwriteNewPlaylist() throws Exception {
        PlaylistResourceCache cache=PlaylistResourceCache.get(InstrumentationRegistry.getInstrumentation().getTargetContext());
        cache.configure(false,false); cache.begin("old"); cache.begin("new");
        try { cache.append("old",new JSONArray(),0,true); fail("stale accepted"); }
        catch(IllegalArgumentException expected) { }
        assertEquals("new",cache.status().getString("playlistId"));
    }
    @Test public void artworkDownloadsCoalesceAndDiskIsReused() throws Exception {
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        java.net.ServerSocket server=new java.net.ServerSocket(0);
        server.setSoTimeout(500);
        java.util.concurrent.atomic.AtomicInteger requests=new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.atomic.AtomicBoolean stopped=new java.util.concurrent.atomic.AtomicBoolean();
        android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(8,8,android.graphics.Bitmap.Config.ARGB_8888);
        java.io.ByteArrayOutputStream encoded=new java.io.ByteArrayOutputStream();
        bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,encoded); bitmap.recycle();
        byte[] image=encoded.toByteArray();
        Thread responder=new Thread(()->{
            while(!stopped.get())try(java.net.Socket socket=server.accept()){
                java.io.BufferedReader in=new java.io.BufferedReader(new java.io.InputStreamReader(socket.getInputStream()));
                String line; while((line=in.readLine())!=null&&!line.isEmpty()) { }
                requests.incrementAndGet();
                java.io.OutputStream out=socket.getOutputStream();
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: "+image.length+"\r\nConnection: close\r\n\r\n").getBytes(java.nio.charset.StandardCharsets.US_ASCII));
                out.write(image);out.flush();
            } catch(Exception ignored) { }
        });
        responder.start();
        java.util.concurrent.ExecutorService pool=java.util.concurrent.Executors.newFixedThreadPool(8);
        try{
            String url="http://127.0.0.1:"+server.getLocalPort()+"/"+java.util.UUID.randomUUID()+".png";
            NativeArtworkRepository repository=NativeArtworkRepository.get(context);
            java.util.List<java.util.concurrent.Future<java.io.File>> results=new java.util.ArrayList<>();
            for(int i=0;i<20;i++)results.add(pool.submit(()->repository.ensureFile(url,false)));
            for(java.util.concurrent.Future<java.io.File> result:results)assertTrue(result.get(30,java.util.concurrent.TimeUnit.SECONDS).isFile());
            assertTrue(repository.ensureFile(url).isFile());
            assertEquals(1,requests.get());
            repository.bind("current",url);repository.bind("current",url+"?version=2");
            assertFalse(repository.matches("current",url));
        }finally{stopped.set(true);server.close();pool.shutdownNow();responder.join(2000);}
    }
    @Test public void currentAndActualTenUpcomingAreReprioritizedAfterJump() throws Exception {
        PlaylistResourceCache cache=PlaylistResourceCache.get(InstrumentationRegistry.getInstrumentation().getTargetContext());
        cache.configure(false,false); cache.begin("priority");
        JSONArray page=new JSONArray();java.util.List<NativePlaylist.Track> tracks=new java.util.ArrayList<>();
        for(int i=0;i<30;i++) {
            page.put(new JSONObject().put("songKey","priority:"+i).put("title","test"));
            tracks.add(new NativePlaylist.Track("priority:"+i,"qq",""+i,"test","","",100000,"",""));
        }
        cache.append("priority",page,0,true);
        NativePlaylist.get().replace(tracks,NativePlaylist.Mode.SEQUENCE,false,0,"test");
        cache.reprioritize(SongInfo.fromTrack(tracks.get(17),1));
        cache.io.submit(()->{}).get(10,java.util.concurrent.TimeUnit.SECONDS);
        try(android.database.Cursor c=cache.getReadableDatabase().rawQuery("SELECT priority,count(*) FROM tasks GROUP BY priority ORDER BY priority",null)) {
            assertTrue(c.moveToNext());assertEquals(0,c.getInt(0));assertEquals(1,c.getInt(1));
            assertTrue(c.moveToNext());assertEquals(1,c.getInt(0));assertEquals(10,c.getInt(1));
            assertTrue(c.moveToNext());assertEquals(2,c.getInt(0));assertEquals(19,c.getInt(1));
        }
    }
    @Test public void seventyTwoRowsDoNotLoseRemainingAndMissingFilesAreRequeued() throws Exception {
        PlaylistResourceCache cache=PlaylistResourceCache.get(InstrumentationRegistry.getInstrumentation().getTargetContext());
        cache.configure(false,false);cache.begin("resume-396");
        for(int offset=0;offset<396;offset+=50){JSONArray page=new JSONArray();
            for(int i=offset;i<Math.min(396,offset+50);i++)page.put(new JSONObject().put("songKey","resume:"+i).put("title","T"+i));
            cache.append("resume-396",page,offset,true);
        }
        cache.catalogComplete("resume-396",true);
        cache.getWritableDatabase().execSQL("UPDATE tasks SET state=1 WHERE ordinal<72");
        // A new reader sees the persisted remainder; marks alone aren't proof of actual files.
        try(android.database.Cursor c=cache.getReadableDatabase().rawQuery("SELECT count(*) FROM tasks WHERE state=0",null)){
            assertTrue(c.moveToFirst());assertEquals(324,c.getInt(0));
        }
        cache.resume(false);assertEquals(396,cache.status().getInt("discovered"));
        assertEquals(0,cache.status().getInt("completed")); // absent files compensated, not fake 72
    }
}
