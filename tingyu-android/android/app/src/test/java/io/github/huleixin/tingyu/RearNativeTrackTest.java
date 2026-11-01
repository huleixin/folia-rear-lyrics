package io.github.huleixin.tingyu;
import org.junit.Test;
import com.getcapacitor.JSObject;
import org.json.JSONObject;
import static org.junit.Assert.*;
// android/app/src/test/java/io/github/huleixin/tingyu/RearNativeTrackTest.java
public class RearNativeTrackTest {
 @org.junit.Before public void before(){RearNativeTrack.elapsedClock=()->1000L;RearNativeTrack.clear();}
 @org.junit.After public void after(){RearNativeTrack.clear();RearNativeTrack.elapsedClock=android.os.SystemClock::elapsedRealtime;}
 @Test public void switchingWithoutMetadataCannotKeepTheOldTitleOrNativeAuthority() throws Exception {
  RearNativeTrack.onTrack("qq:a",new JSObject().put("title","A").put("artist","Artist").put("durationMs",10000));
  RearNativeTrack.onPlayback(true,1000,1.5f);
  assertEquals(1.5,RearNativeTrack.snapshot().getDouble("playbackRate"),.001);
  RearNativeTrack.onTrack("qq:b",null);JSONObject next=RearNativeTrack.snapshot();
  assertEquals("qq:b",next.getString("songKey"));assertEquals("",next.getString("title"));assertEquals("",next.getString("artist"));
  RearNativeTrack.clear();assertFalse(RearNativeTrack.hasTrack());
 }
 @Test public void snapshotDoesNotMixTwoConcurrentTrackIdentities() throws Exception {
  java.util.concurrent.atomic.AtomicReference<Throwable> error=new java.util.concurrent.atomic.AtomicReference<>();
  Thread writer=new Thread(()->{try{for(int i=0;i<500;i++){String key="qq:"+i;RearNativeTrack.onTrack(key,new JSObject().put("title",key));}}catch(Throwable failure){error.set(failure);}});
  writer.start();
  while(writer.isAlive()){JSONObject value=RearNativeTrack.snapshot();String key=value.optString("songKey");if(!key.isEmpty())assertEquals(key,value.optString("title"));}
  writer.join();if(error.get()!=null)throw new AssertionError(error.get());RearNativeTrack.clear();
 }
}
