package io.github.huleixin.tingyu.playback;

import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/PcmEffects.java
/** Native counterparts of the existing post-EQ controls. Buffers belong to one decoder only. */
final class PcmEffects {
    private double high=20,low=20000,drive,crush,wow,noise,width=1,space,punch,driveScale=1,envelope;
    private double[][] hp,lp,delay;
    private final double[] hpc=new double[5],lpc=new double[5];
    private int rate,channels,cursor;private long frame;
    private int random=0x13579bdf;
    private boolean active;
    static boolean needed(JSONObject e){
        if(e==null)return false;
        return e.optDouble("highpass",20)>20||e.optDouble("lowpass",20000)<20000||e.optDouble("width",1)!=1
            ||e.optDouble("drive")>0||e.optDouble("crush")>0||e.optDouble("wow")>0||e.optDouble("noise")>0||e.optDouble("space")>0||e.optDouble("punch")>0;
    }
    private static double value(JSONObject e,String key,double neutral,double min,double max){double v=e==null?neutral:e.optDouble(key,neutral);return Double.isFinite(v)?Math.max(min,Math.min(max,v)):neutral;}
    void configure(JSONObject effects,boolean enabled,int rate,int channels){
        active=enabled&&needed(effects);this.rate=rate;
        if(this.channels!=channels){this.channels=channels;hp=new double[channels][2];lp=new double[channels][2];delay=null;cursor=0;}
        JSONObject e=enabled?effects:null;
        high=value(e,"highpass",20,20,2000);low=value(e,"lowpass",20000,500,20000);
        drive=value(e,"drive",0,0,1);crush=value(e,"crush",0,0,1);wow=value(e,"wow",0,0,1);noise=value(e,"noise",0,0,1);
        width=value(e,"width",1,0,2);space=value(e,"space",0,0,1);punch=value(e,"punch",0,0,1);
        coefficients(hpc,high,true);coefficients(lpc,low,false);
        if((space>0||wow>0)&&(delay==null||delay[0].length!=rate/2)){delay=new double[channels][Math.max(1,rate/2)];cursor=0;}
        if(space==0&&wow==0)delay=null;
        if(drive>0){double shape=1+drive*4,scale=Math.tanh(shape),energy=0;for(int i=0;i<1024;i++){double x=Math.tanh(shape*.5*Math.sin(2*Math.PI*i/1024))/scale;energy+=x*x;}driveScale=(.5/Math.sqrt(2))/Math.sqrt(energy/1024)/scale;}
    }
    void reset(){hp=lp=null;delay=null;channels=0;frame=0;cursor=0;envelope=0;}
    private void coefficients(double[] out,double hz,boolean highpass){
        double w=2*Math.PI*Math.min(hz,rate*.475)/rate,c=Math.cos(w),a=Math.sin(w)/1.4,den=1+a;
        out[0]=(1+(highpass?c:-c))/2/den;out[1]=(highpass?-(1+c):1-c)/den;out[2]=out[0];out[3]=-2*c/den;out[4]=(1-a)/den;
    }
    private static double filter(double x,double[] c,double[] state){double y=c[0]*x+state[0];state[0]=c[1]*x-c[3]*y+state[1];state[1]=c[2]*x-c[4]*y;return y;}
    private double random(){random^=random<<13;random^=random>>>17;random^=random<<5;return random/(double)Integer.MAX_VALUE;}
    private double delayed(int channel,double samples){
        int size=delay[channel].length;double at=cursor-samples;while(at<0)at+=size;int i=(int)at%size,j=(i+1)%size;double f=at-Math.floor(at);return delay[channel][i]*(1-f)+delay[channel][j]*f;
    }
    void apply(double[] samples){
        if(!active)return;
        double peak=0;
        for(int c=0;c<channels;c++){
            double x=samples[c];
            if(high>20)x=filter(x,hpc,hp[c]);if(low<20000)x=filter(x,lpc,lp[c]);
            if(drive>0)x=Math.tanh((1+drive*4)*x)*driveScale;
            if(crush>0){double steps=Math.max(2,Math.pow(2,15-Math.sqrt(crush)*12));x=Math.round(x*steps)/steps;}
            if(delay!=null){
                double wet=space>0?(delayed(c,rate*.0297)+delayed(c,rate*.0371)+delayed(c,rate*.0411)+delayed(c,rate*.0437))*.25:0;
                delay[c][cursor]=x+wet*space*.65;
                if(wow>0)x=delayed(c,rate*(.012+wow*(.0045*Math.sin(frame*2*Math.PI*.7/rate)+.0006*Math.sin(frame*2*Math.PI*6.8/rate))));
                x=x*(1-space*.2)+wet*space*.75;
            }
            if(noise>0)x+=random()*.012*noise;
            samples[c]=x;peak=Math.max(peak,Math.abs(x));
        }
        if(channels==2&&width!=1){double mid=(samples[0]+samples[1])*.5,side=(samples[0]-samples[1])*.5*width;samples[0]=mid+side;samples[1]=mid-side;}
        if(punch>0){
            double coefficient=Math.exp(-1.0/(rate*(peak>envelope?.008:.18)));envelope=coefficient*envelope+(1-coefficient)*peak;
            double db=20*Math.log10(Math.max(1e-9,envelope)),threshold=-6-punch*26,ratio=1+punch*7;
            double attenuation=db>threshold?threshold+(db-threshold)/ratio-db:0,makeup=Math.pow(10,(attenuation+punch*3)/20);
            for(int c=0;c<channels;c++)samples[c]*=makeup;
        }
        if(delay!=null)cursor=(cursor+1)%delay[0].length;frame++;
    }
}
