package io.github.huleixin.tingyu.playback;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.AudioProcessingPipeline;
import com.google.common.collect.ImmutableList;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/PlaybackSpectrumProcessorTest.java
public final class PlaybackSpectrumProcessorTest {
    @Test public void sharedEmptyBufferDoesNotCopyItself() throws Exception {
        PlaybackSpectrumProcessor processor=new PlaybackSpectrumProcessor(bins->{});
        processor.configure(new AudioProcessor.AudioFormat(22050,1,C.ENCODING_PCM_16BIT));processor.flush();
        // Media3's pipeline uses this singleton when a stage has no input available.
        processor.queueInput(AudioProcessor.EMPTY_BUFFER);
        assertFalse(processor.getOutput().hasRemaining());
    }
    @Test public void emptyPollAfterRealPcmDoesNotDropOrAlterTheOutput() throws Exception {
        PlaybackSpectrumProcessor processor=new PlaybackSpectrumProcessor(bins->{});
        processor.configure(new AudioProcessor.AudioFormat(48000,2,C.ENCODING_PCM_16BIT));processor.flush();
        ByteBuffer input=ByteBuffer.allocateDirect(8).order(ByteOrder.nativeOrder());
        input.putShort((short)123).putShort((short)-123).putShort((short)32767).putShort((short)-32768).flip();
        processor.queueInput(input);processor.queueInput(AudioProcessor.EMPTY_BUFFER);
        ByteBuffer output=processor.getOutput().order(ByteOrder.nativeOrder());
        assertEquals(8,output.remaining());assertEquals(123,output.getShort());assertEquals(-123,output.getShort());
        assertEquals(32767,output.getShort());assertEquals(-32768,output.getShort());assertFalse(input.hasRemaining());
        processor.queueInput(AudioProcessor.EMPTY_BUFFER);assertFalse(processor.getOutput().hasRemaining());
    }
    @Test public void actualMedia3PipelineCanPollDrainAndChangeFormat() throws Exception {
        PlaybackSpectrumProcessor processor=new PlaybackSpectrumProcessor(bins->{});
        AudioProcessingPipeline pipeline=new AudioProcessingPipeline(ImmutableList.of(processor));
        for(int channels:new int[]{1,2}){
            pipeline.configure(new AudioProcessor.AudioFormat(22050,channels,C.ENCODING_PCM_16BIT));pipeline.flush();
            assertFalse(pipeline.getOutput().hasRemaining());
            ByteBuffer input=ByteBuffer.allocateDirect(channels*8).order(ByteOrder.nativeOrder());
            while(input.hasRemaining())input.putShort((short)1000);input.flip();pipeline.queueInput(input);
            ByteBuffer output=pipeline.getOutput().order(ByteOrder.nativeOrder());assertEquals(channels*8,output.remaining());
            while(output.hasRemaining())assertEquals(1000,output.getShort());assertFalse(pipeline.getOutput().hasRemaining());
            pipeline.queueEndOfStream();assertFalse(pipeline.getOutput().hasRemaining());assertTrue(pipeline.isEnded());
        }
        pipeline.reset();
    }
    @Test public void enabledAnalysisAlsoIgnoresEmptyPolls() throws Exception {
        PlaybackSpectrumProcessor processor=new PlaybackSpectrumProcessor(bins->{fail("No PCM data to analyse");});
        processor.configure(new AudioProcessor.AudioFormat(48000,2,C.ENCODING_PCM_16BIT));processor.flush();processor.enabled=true;
        processor.queueInput(AudioProcessor.EMPTY_BUFFER);assertFalse(processor.getOutput().hasRemaining());
    }
}
