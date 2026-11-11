package io.github.huleixin.tingyu.playback;

import androidx.media3.common.C;
import androidx.media3.common.audio.BaseAudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.json.JSONArray;
import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/PcmEqualizerProcessor.java
/** Ten RBJ filters and per-track ReplayGain on decoded PCM, including while the UI is asleep. */
final class PcmEqualizerProcessor extends BaseAudioProcessor {
    private static final double[] HZ={31,62,125,250,500,1000,2000,4000,8000,16000};
    private volatile Settings requested=new Settings(false,new double[10],1);
    private Settings applied;
    private Filter[][] filters=new Filter[0][];
    private double gain=1;
    private final PcmEffects effects=new PcmEffects();
    private double[] frame=new double[0];
    static final class Settings {
        final boolean enabled;final double[] gains;final double replay;JSONObject effects;
        Settings(boolean enabled,double[] gains,double replay){this.enabled=enabled;this.gains=gains.clone();this.replay=replay;}
    }
    void configure(JSONObject value,double replay){
        JSONArray bands=value==null?null:value.optJSONArray("gains");double[] gains=new double[10];
        for(int i=0;i<10;i++)gains[i]=clamp(bands==null?0:bands.optDouble(i,0),-12,12);
        Settings next=new Settings(value!=null&&value.optBoolean("enabled"),gains,clamp(replay,0,16));
        next.effects=value==null?null:value.optJSONObject("effects");requested=next;
    }
    boolean needed(){Settings s=requested;if(s.replay!=1||s.enabled&&PcmEffects.needed(s.effects))return true;for(double db:s.gains)if(s.enabled&&db!=0)return true;return false;}
    private static double clamp(double v,double lo,double hi){return Double.isFinite(v)?Math.max(lo,Math.min(hi,v)):lo;}
    @Override protected AudioFormat onConfigure(AudioFormat format){return format.encoding==C.ENCODING_PCM_16BIT?format:AudioFormat.NOT_SET;}
    @Override protected void onFlush(){applied=null;filters=new Filter[0][];gain=requested.replay;effects.reset();}
    @Override public void queueInput(ByteBuffer input){
        if(!input.hasRemaining())return;
        Settings settings=requested;int channels=inputAudioFormat.channelCount;
        if(settings!=applied){
            if(filters.length!=channels){filters=new Filter[channels][10];for(int c=0;c<channels;c++)for(int b=0;b<10;b++)filters[c][b]=new Filter();}
            for(Filter[] channel:filters)for(int b=0;b<10;b++)channel[b].coefficients(inputAudioFormat.sampleRate,HZ[b],settings.enabled?settings.gains[b]:0,b);
            applied=settings;
            frame=new double[channels];effects.configure(settings.effects,settings.enabled,inputAudioFormat.sampleRate,channels);
        }
        ByteBuffer output=replaceOutputBuffer(input.remaining()).order(ByteOrder.LITTLE_ENDIAN);
        input.order(ByteOrder.LITTLE_ENDIAN);
        // A short slew keeps a live ReplayGain change from discontinuously stepping the waveform.
        while(input.remaining()>=channels*2){
            gain+=(settings.replay-gain)*Math.min(1,1.0/(inputAudioFormat.sampleRate*.015));
            for(int c=0;c<channels;c++){
                double sample=input.getShort()/32768.0;
                for(int b=0;b<10;b++)sample=filters[c][b].apply(sample);
                frame[c]=sample*gain;
            }
            effects.apply(frame);
            for(int c=0;c<channels;c++)output.putShort((short)Math.round(clamp(frame[c],-1,32767.0/32768)*32768));
        }
        while(input.hasRemaining())output.put(input.get());output.flip();
    }
    private static final class Filter {
        double b0=1,b1,b2,a1,a2,z1,z2;
        double apply(double x){double y=b0*x+z1;z1=b1*x-a1*y+z2;z2=b2*x-a2*y;return y;}
        void coefficients(double rate,double hz,double db,int band){
            if(db==0){b0=1;b1=b2=a1=a2=0;z1=z2=0;return;}
            double a=Math.pow(10,db/40),w=2*Math.PI*Math.min(hz,rate*.475)/rate,c=Math.cos(w),s=Math.sin(w),alpha=s/(2*1.4);
            double a0;
            if(band==0||band==9){
                double beta=2*Math.sqrt(a)*alpha;
                if(band==0){b0=a*((a+1)-(a-1)*c+beta);b1=2*a*((a-1)-(a+1)*c);b2=a*((a+1)-(a-1)*c-beta);a0=(a+1)+(a-1)*c+beta;a1=-2*((a-1)+(a+1)*c);a2=(a+1)+(a-1)*c-beta;}
                else{b0=a*((a+1)+(a-1)*c+beta);b1=-2*a*((a-1)+(a+1)*c);b2=a*((a+1)+(a-1)*c-beta);a0=(a+1)-(a-1)*c+beta;a1=2*((a-1)-(a+1)*c);a2=(a+1)-(a-1)*c-beta;}
            }else{b0=1+alpha*a;b1=-2*c;b2=1-alpha*a;a0=1+alpha/a;a1=-2*c;a2=1-alpha/a;}
            b0/=a0;b1/=a0;b2/=a0;a1/=a0;a2/=a0;
        }
    }
}
