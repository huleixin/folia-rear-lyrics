package io.github.huleixin.tingyu.playback;

import android.os.SystemClock;
import androidx.media3.common.C;
import androidx.media3.common.audio.BaseAudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.function.Consumer;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/PlaybackSpectrumProcessor.java
final class PlaybackSpectrumProcessor extends BaseAudioProcessor {
    volatile boolean enabled;
    private final float[] samples=new float[PcmSpectrum.SIZE];
    private final PcmSpectrum fft=new PcmSpectrum();
    private int cursor;
    private long lastEmission;
    private final Consumer<int[]> sink;
    PlaybackSpectrumProcessor(Consumer<int[]> sink){this.sink=sink;}
    @Override protected AudioFormat onConfigure(AudioFormat format){return format.encoding==C.ENCODING_PCM_16BIT?format:AudioFormat.NOT_SET;}
    @Override public void queueInput(ByteBuffer input){
        // Media3 polls active processors with its shared EMPTY_BUFFER. Do not replace
        // pending output or attempt EMPTY_BUFFER.put(EMPTY_BUFFER) on these polls.
        if(!input.hasRemaining())return;
        if(enabled){
            ByteBuffer pcm=input.duplicate().order(ByteOrder.LITTLE_ENDIAN);
            int channels=Math.max(1,inputAudioFormat.channelCount),frameBytes=channels*2;
            while(pcm.remaining()>=frameBytes){float value=0;for(int channel=0;channel<channels;channel++)value+=pcm.getShort()/32768f;
                samples[cursor]=value/channels;cursor=(cursor+1)%samples.length;
            }
            long now=SystemClock.elapsedRealtime();
            if(now-lastEmission>=50){lastEmission=now;sink.accept(fft.bins(samples,cursor,inputAudioFormat.sampleRate));}
        }
        ByteBuffer output=replaceOutputBuffer(input.remaining());output.put(input).flip();
    }
    @Override protected void onFlush(){cursor=0;lastEmission=0;java.util.Arrays.fill(samples,0);}
}
