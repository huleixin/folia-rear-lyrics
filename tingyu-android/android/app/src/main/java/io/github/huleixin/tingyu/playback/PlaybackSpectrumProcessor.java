package io.github.huleixin.tingyu.playback;

import android.os.SystemClock;
import androidx.media3.common.C;
import androidx.media3.common.audio.BaseAudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.function.Consumer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/PlaybackSpectrumProcessor.java
final class PlaybackSpectrumProcessor extends BaseAudioProcessor {
    volatile boolean enabled;
    private final float[] samples=new float[PcmSpectrum.SIZE];
    private final PcmSpectrum fft=new PcmSpectrum();
    private int cursor;
    private long lastEmission;
    private final Consumer<int[]> sink;
    private final ExecutorService worker=Executors.newSingleThreadExecutor(r->{Thread thread=new Thread(r,"Tingyu-Spectrum");thread.setDaemon(true);return thread;});
    private final AtomicBoolean pending=new AtomicBoolean();
    private volatile long generation;
    private final java.util.function.LongSupplier clock;
    PlaybackSpectrumProcessor(Consumer<int[]> sink){this(sink,SystemClock::elapsedRealtime);}
    PlaybackSpectrumProcessor(Consumer<int[]> sink,java.util.function.LongSupplier clock){this.sink=sink;this.clock=clock;}
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
            long now=clock.getAsLong();
            if(now-lastEmission>=50&&pending.compareAndSet(false,true)){
                lastEmission=now;float[] frame=samples.clone();int offset=cursor,rate=inputAudioFormat.sampleRate;long token=generation;
                // Visualization must never hold the audio-output thread behind an FFT,
                // particularly while the stage's GPU resources are being mounted/disposed.
                try{worker.execute(()->{try{if(enabled&&generation==token){int[] result=fft.bins(frame,offset,rate);if(enabled&&generation==token)sink.accept(result);}}finally{pending.set(false);}});}
                catch(java.util.concurrent.RejectedExecutionException ignored){pending.set(false);}
            }
        }
        ByteBuffer output=replaceOutputBuffer(input.remaining());output.put(input).flip();
    }
    @Override protected void onFlush(){generation++;cursor=0;lastEmission=0;java.util.Arrays.fill(samples,0);}
    void close(){enabled=false;generation++;worker.shutdownNow();}
}
