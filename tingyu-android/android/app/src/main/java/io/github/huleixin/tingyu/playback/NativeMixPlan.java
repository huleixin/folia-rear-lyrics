package io.github.huleixin.tingyu.playback;

import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/NativeMixPlan.java
/** Media-time plan and equal-power envelopes, independent of Android's UI or bridge clock. */
final class NativeMixPlan {
    final long start,entry,length;final float stretch;final String source;
    NativeMixPlan(long start,long entry,long length,float stretch,String source){this.start=start;this.entry=entry;this.length=length;this.stretch=stretch;this.source=source;}
    static NativeMixPlan resolve(String from,String to,long duration,long nextDuration,double seconds,JSONObject plan){
        if(duration<=0||nextDuration<=0)return null;
        if(plan!=null&&from.equals(plan.optString("fromKey"))&&to.equals(plan.optString("toKey"))){
            if(!plan.optBoolean("fade",true))return null;
            long start=plan.optLong("outStartMs",-1),entry=plan.optLong("inStartMs",0),length=plan.optLong("overlapMs",0);
            if(start>=0&&entry>=0&&length>=40&&start+length<=duration+1000&&entry+length<=nextDuration)
                return new NativeMixPlan(start,entry,length,(float)Math.max(.85,Math.min(1.15,plan.optDouble("stretch",1))),"planner");
        }
        long length=Math.min((long)(Math.max(.8,Math.min(30,seconds))*1000),Math.min(duration/2,nextDuration/2));
        return length>=800?new NativeMixPlan(duration-length,0,length,1,"native-fallback"):null;
    }
    static float incoming(double progress){return (float)Math.sin(Math.max(0,Math.min(1,progress))*Math.PI/2);}
    static float outgoing(double progress){return (float)Math.cos(Math.max(0,Math.min(1,progress))*Math.PI/2);}
}
