package io.github.huleixin.tingyu.playback;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/PcmEqualizerProcessorTest.java
public final class PcmEqualizerProcessorTest {
    private PcmEqualizerProcessor processor(JSONObject eq,double gain,int channels)throws Exception{
        PcmEqualizerProcessor p=new PcmEqualizerProcessor();p.configure(eq,gain);
        p.configure(new AudioProcessor.AudioFormat(48000,channels,C.ENCODING_PCM_16BIT));p.flush();return p;
    }
    private ByteBuffer sine(double hz,int channels){
        ByteBuffer input=ByteBuffer.allocateDirect(48000*channels*2).order(ByteOrder.nativeOrder());
        for(int n=0;n<48000;n++)for(int c=0;c<channels;c++)input.putShort((short)(3000*Math.sin(2*Math.PI*hz*n/48000)));input.flip();return input;
    }
    private double rms(ByteBuffer pcm){double energy=0;int n=0;pcm.order(ByteOrder.nativeOrder());pcm.position(pcm.limit()/2);while(pcm.hasRemaining()){double x=pcm.getShort();energy+=x*x;n++;}return Math.sqrt(energy/n);}
    @Test public void neutralPreservesEverySampleAndEmptyPollDoesNotDropOutput()throws Exception{
        PcmEqualizerProcessor p=processor(null,1,2);ByteBuffer input=sine(440,2),copy=input.duplicate();
        p.queueInput(input);p.queueInput(AudioProcessor.EMPTY_BUFFER);ByteBuffer out=p.getOutput();
        assertEquals(copy,out);assertFalse(p.needed());
    }
    @Test public void replayGainChangesRealPcmBySixDecibels()throws Exception{
        PcmEqualizerProcessor flat=processor(null,1,1),quiet=processor(null,.5,1);
        flat.queueInput(sine(1000,1));quiet.queueInput(sine(1000,1));
        assertEquals(.5,rms(quiet.getOutput())/rms(flat.getOutput()),.001);assertTrue(quiet.needed());
    }
    @Test public void equalizerBoostsItsBandWithoutBoostingDistantBand()throws Exception{
        JSONObject eq=new JSONObject().put("enabled",true).put("gains",new JSONArray(new double[]{0,0,0,0,0,6,0,0,0,0}));
        PcmEqualizerProcessor mid=processor(eq,1,2),flat=processor(null,1,2);
        mid.queueInput(sine(1000,2));flat.queueInput(sine(1000,2));assertEquals(Math.pow(10,6/20.0),rms(mid.getOutput())/rms(flat.getOutput()),.02);
        mid.flush();flat.flush();mid.queueInput(sine(100,2));flat.queueInput(sine(100,2));assertEquals(1,rms(mid.getOutput())/rms(flat.getOutput()),.03);
    }
    @Test public void effectsAreAppliedNativelyAndDisableReturnsToNeutral()throws Exception{
        JSONObject eq=new JSONObject().put("enabled",true).put("effects",new JSONObject().put("lowpass",1000).put("width",0));
        PcmEqualizerProcessor p=processor(eq,1,2),flat=processor(null,1,2);p.queueInput(sine(10000,2));flat.queueInput(sine(10000,2));
        assertTrue(rms(p.getOutput())<rms(flat.getOutput())*.03);
        eq.put("enabled",false);p.configure(eq,1);p.flush();ByteBuffer input=sine(10000,2),copy=input.duplicate();p.queueInput(input);assertEquals(copy,p.getOutput());
    }
}
