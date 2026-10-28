package io.github.huleixin.tingyu.playback;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/PcmSpectrumTest.java
public final class PcmSpectrumTest {
    @Test public void realPcmTonePeaksAtTheExpectedFrequency(){
        float[] samples=new float[PcmSpectrum.SIZE];for(int i=0;i<samples.length;i++)samples[i]=(float)Math.sin(2*Math.PI*440*i/48000)*.01f;
        int[] bins=new PcmSpectrum().bins(samples,0,48000);int peak=0;
        for(int i=1;i<bins.length;i++)if(bins[i]>bins[peak])peak=i;
        assertTrue(peak>=19&&peak<=22);assertTrue(bins[peak]>150);
        for(int value:bins)assertTrue(value>=0&&value<=255);
    }
    @Test public void silenceAndCircularSampleOffsetsRemainBounded(){
        for(int value:new PcmSpectrum().bins(new float[PcmSpectrum.SIZE],193,44100))assertEquals(0,value);
    }
}
