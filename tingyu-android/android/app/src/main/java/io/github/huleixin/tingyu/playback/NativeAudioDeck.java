package io.github.huleixin.tingyu.playback;

import android.content.Context;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import okhttp3.OkHttpClient;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/NativeAudioDeck.java
/** Every decoder owns its processors; no PCM state is shared across the two audio threads. */
final class NativeAudioDeck {
    static final AudioAttributes ATTRIBUTES=new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA)
        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build();
    final ExoPlayer player;
    final PlaybackSpectrumProcessor spectrum;
    final PcmEqualizerProcessor processing=new PcmEqualizerProcessor();
    NativeAudioDeck(ExoPlayer player){this.player=player;spectrum=new PlaybackSpectrumProcessor(bins->{});}
    NativeAudioDeck(Context context,boolean focus,Consumer<int[]> sink){
        spectrum=new PlaybackSpectrumProcessor(sink);
        DefaultRenderersFactory renderers=new DefaultRenderersFactory(context){
            @Override protected AudioSink buildAudioSink(Context context,boolean floating,boolean params){
                return new DefaultAudioSink.Builder(context).setEnableFloatOutput(false)
                    .setAudioProcessors(new AudioProcessor[]{processing,spectrum}).build();
            }
        };
        OkHttpClient http=new OkHttpClient.Builder().connectTimeout(15,TimeUnit.SECONDS).readTimeout(30,TimeUnit.SECONDS).build();
        player=new ExoPlayer.Builder(context,renderers).setMediaSourceFactory(new DefaultMediaSourceFactory(
            new DefaultDataSource.Factory(context,new OkHttpDataSource.Factory(http)
                .setUserAgent("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36")
                .setDefaultRequestProperties(java.util.Collections.singletonMap("Referer","https://y.qq.com/")))))
            .setAudioAttributes(ATTRIBUTES,focus).setHandleAudioBecomingNoisy(focus).setWakeMode(C.WAKE_MODE_LOCAL).build();
    }
    void focus(boolean enabled){player.setAudioAttributes(ATTRIBUTES,enabled);player.setHandleAudioBecomingNoisy(enabled);}
    void pcm(){player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setAudioOffloadPreferences(
        new TrackSelectionParameters.AudioOffloadPreferences.Builder().setAudioOffloadMode(0).build()).build());}
    void close(){player.release();spectrum.close();}
}
