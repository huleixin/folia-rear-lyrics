package io.github.huleixin.tingyu.playback;
import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.SilenceMediaSource;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;
// android/app/src/androidTest/java/io/github/huleixin/tingyu/playback/SleepTimerDeviceTest.java
@RunWith(AndroidJUnit4.class)
public class SleepTimerDeviceTest {
 @Test public void endBarrierStopsBeforeQueuedSuccessorAndDoesNotLoseTheQueue() throws Exception {verifyEnd(false);}
 @Test public void repeatOneStillStopsAtFirstNaturalEnd() throws Exception {verifyEnd(true);}
 private void verifyEnd(boolean repeat) throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();CountDownLatch ended=new CountDownLatch(1);
  ExoPlayer[] holder=new ExoPlayer[1];Throwable[] failure=new Throwable[1];
  InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
   ExoPlayer player=new ExoPlayer.Builder(context).build();holder[0]=player;
   player.addMediaSource(new SilenceMediaSource.Factory().setDurationUs(250000).createMediaSource());
   player.addMediaSource(new SilenceMediaSource.Factory().setDurationUs(250000).createMediaSource());
   SleepTimerController timer=SleepTimerController.get(context);timer.attach(player,player::pause);
   player.addListener(new androidx.media3.common.Player.Listener(){
    @Override public void onPlayWhenReadyChanged(boolean ready,int reason){if(reason==androidx.media3.common.Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM){
     try{timer.boundary();assertEquals(0,player.getCurrentMediaItemIndex());assertFalse(player.getPlayWhenReady());assertEquals(2,player.getMediaItemCount());assertFalse(timer.snapshot().optBoolean("active"));}catch(Throwable error){failure[0]=error;}finally{ended.countDown();}
    }}
   });if(repeat)player.setRepeatMode(androidx.media3.common.Player.REPEAT_MODE_ONE);player.prepare();timer.start("track",0);player.play();
  });
  try{assertTrue(ended.await(10,TimeUnit.SECONDS));if(failure[0]!=null)throw new AssertionError(failure[0]);}
  finally{InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{SleepTimerController.get(context).detach();holder[0].release();});}
 }
}
