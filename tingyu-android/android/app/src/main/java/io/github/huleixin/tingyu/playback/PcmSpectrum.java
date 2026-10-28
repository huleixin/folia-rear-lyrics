package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/PcmSpectrum.java
/** Bounded radix-2 FFT. No microphone permission or second audio decoder. */
public final class PcmSpectrum {
    public static final int SIZE=2048;
    private final double[] real=new double[SIZE],imaginary=new double[SIZE];
    public int[] bins(float[] samples,int cursor,int sampleRate){
        for(int i=0;i<SIZE;i++){real[i]=samples[(cursor+i)%SIZE]*(.5-.5*Math.cos(2*Math.PI*i/(SIZE-1)));imaginary[i]=0;}
        for(int i=1,j=0;i<SIZE;i++){
            int bit=SIZE>>1;for(; (j&bit)!=0;bit>>=1)j^=bit;j^=bit;
            if(i<j){double temp=real[i];real[i]=real[j];real[j]=temp;}
        }
        for(int length=2;length<=SIZE;length*=2){
            double angle=-2*Math.PI/length,wr0=Math.cos(angle),wi0=Math.sin(angle);
            for(int start=0;start<SIZE;start+=length){double wr=1,wi=0;
                for(int j=0;j<length/2;j++){
                    int a=start+j,b=a+length/2;
                    double r=real[b]*wr-imaginary[b]*wi,im=real[b]*wi+imaginary[b]*wr;
                    real[b]=real[a]-r;imaginary[b]=imaginary[a]-im;real[a]+=r;imaginary[a]+=im;
                    double next=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=next;
                }
            }
        }
        int[] output=new int[1024];
        for(int i=0;i<output.length;i++){
            int bin=Math.min(SIZE/2-1,Math.round(i*21.5f*SIZE/Math.max(1,sampleRate)));
            double magnitude=Math.hypot(real[bin],imaginary[bin])/(SIZE/2.0);
            output[i]=(int)Math.max(0,Math.min(255,(20*Math.log10(Math.max(1e-8,magnitude))+100)*255/70));
        }
        return output;
    }
}
