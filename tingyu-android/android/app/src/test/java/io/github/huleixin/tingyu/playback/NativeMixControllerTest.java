package io.github.huleixin.tingyu.playback;

import android.os.Handler;
import android.os.Looper;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import com.getcapacitor.JSObject;
import java.lang.reflect.Proxy;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import static org.robolectric.Shadows.shadowOf;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/NativeMixControllerTest.java
@RunWith(RobolectricTestRunner.class)
@Config(manifest=Config.NONE,sdk=35)
@LooperMode(LooperMode.Mode.PAUSED)
public final class NativeMixControllerTest {
    /** Decoder port: production controller and main-looper scheduling, deterministic media clocks. */
    private static final class Decoder {
        List<MediaItem> items=new ArrayList<>();long position,duration=20000;float volume=1;
        int state=Player.STATE_READY,repeat;boolean playing=true,released;int next=1;
        final ExoPlayer player=(ExoPlayer)Proxy.newProxyInstance(ExoPlayer.class.getClassLoader(),new Class[]{ExoPlayer.class},(proxy,method,args)->{
            switch(method.getName()){
                case "getCurrentMediaItem":return items.isEmpty()?null:items.get(0);
                case "getMediaItemAt":return items.get((int)args[0]);
                case "getMediaItemCount":return items.size();
                case "getNextMediaItemIndex":return items.size()>1?next:-1;
                case "getPlaybackState":return state;
                case "getPlaybackSuppressionReason":return Player.PLAYBACK_SUPPRESSION_REASON_NONE;
                case "getRepeatMode":return repeat;
                case "getCurrentPosition":return position;
                case "getDuration":return duration;
                case "getPlayWhenReady":case "isPlaying":return playing&&state==Player.STATE_READY;
                case "getVolume":return volume;
                case "setVolume":volume=(float)args[0];return null;
                case "setMediaItems":items=new ArrayList<>((List<MediaItem>)args[0]);position=(long)args[2];return null;
                case "removeMediaItems":items.subList((int)args[0],(int)args[1]).clear();return null;
                case "addMediaItem":items.add((MediaItem)args[0]);return null;
                case "play":playing=true;return null;
                case "pause":playing=false;return null;
                case "release":released=true;playing=false;return null;
                case "getTrackSelectionParameters":return androidx.media3.common.TrackSelectionParameters.DEFAULT_WITHOUT_CONTEXT;
                case "getPlayerError":return null;
            }
            Class<?> r=method.getReturnType();if(r==boolean.class)return false;if(r==int.class)return 0;if(r==long.class)return 0L;if(r==float.class)return 0f;return null;
        });
    }
    private static MediaItem song(String id){return new MediaItem.Builder().setMediaId(id).setUri("https://audio.test/"+id)
        .setTag(new JSObject().put("duration",20000)).build();}
    private static final class Fixture implements NativeMixController.Host {
        Decoder first=new Decoder(),second;NativeAudioDeck active;boolean allowed=true,failPromotion;int promotions;
        final NativeMixController mix;
        Fixture(){first.items.add(song("a"));first.items.add(song("b"));first.items.add(song("c"));active=new NativeAudioDeck(first.player);
            mix=new NativeMixController(new Handler(Looper.getMainLooper()),this);
            mix.configure(new JSObject().put("enabled",true).put("seconds",5));}
        public NativeAudioDeck active(){return active;}
        public NativeAudioDeck create(){second=new Decoder();second.playing=false;return new NativeAudioDeck(second.player);}
        public void promote(NativeAudioDeck incoming){if(failPromotion)throw new IllegalStateException("focus transfer failed");active=incoming;second.playing=true;promotions++;}
        public boolean allowed(){return allowed;}
        public float volume(){return .8f;}
        public void configure(NativeAudioDeck deck,MediaItem item){}
        void tick(){shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(100));}
        void start(){first.position=14000;tick();assertEquals("preloading",mix.diagnostics().optString("mixState"));first.position=15000;tick();}
        void close(){mix.close();active.close();}
    }
    @Test public void preloadsThenActuallyRunsBothDecodersAndFadesUsingMediaTime(){
        Fixture f=new Fixture();try{
            f.start();assertEquals(1,f.promotions);assertTrue(f.mix.diagnostics().optBoolean("mixTailPlaying"));assertTrue(f.mix.diagnostics().optBoolean("mixIncomingPlaying"));
            f.second.position=2500;f.tick();assertEquals(.8/Math.sqrt(2),f.first.volume,.001);assertEquals(.8/Math.sqrt(2),f.second.volume,.001);
            // Main-looper time advances but a stalled media clock must not advance the envelope.
            f.tick();assertEquals(.8/Math.sqrt(2),f.first.volume,.001);
            f.second.position=5000;f.tick();assertTrue(f.first.released);assertFalse(f.mix.overlapping());assertEquals(.8,f.second.volume,.001);
            assertEquals(1,f.mix.diagnostics().optInt("mixCompleted"));
        }finally{f.close();}
    }
    @Test public void pauseSeekOrSleepBarrierCannotLeaveAnOrphanTail(){
        Fixture f=new Fixture();try{f.start();f.allowed=false;f.tick();assertTrue(f.first.released);assertFalse(f.mix.overlapping());}finally{f.close();}
        Fixture seek=new Fixture();try{seek.start();seek.mix.cancel();assertTrue(seek.first.released);assertFalse(seek.mix.overlapping());}finally{seek.close();}
    }
    @Test public void unavailableNextDecoderDoesNotFadeAwayTheOnlyAudibleTrack(){
        Fixture f=new Fixture();try{
            f.first.position=14000;f.tick();f.second.state=Player.STATE_BUFFERING;f.first.position=15000;f.tick();
            assertEquals(0,f.promotions);assertTrue(f.first.playing);assertFalse(f.first.released);assertEquals("next-not-ready",f.mix.diagnostics().optString("mixReason"));
        }finally{f.close();}
    }
    @Test public void changingNextTrackDiscardsTheStalePreload(){
        Fixture f=new Fixture();try{
            f.first.position=14000;f.tick();Decoder stale=f.second;f.first.items.set(1,song("d"));f.tick();
            assertTrue(stale.released);assertEquals("d",f.second.items.get(0).mediaId);assertEquals(0,f.promotions);
        }finally{f.close();}
    }
    @Test public void failedPromotionCannotReleaseTheStillAudibleOwner(){
        Fixture f=new Fixture();try{
            f.first.position=14000;f.tick();f.failPromotion=true;f.first.position=15000;f.tick();
            assertFalse(f.first.released);assertTrue(f.first.playing);assertTrue(f.second.released);
            assertFalse(f.mix.overlapping());assertEquals("error",f.mix.diagnostics().optString("mixState"));
        }finally{f.close();}
    }
}
