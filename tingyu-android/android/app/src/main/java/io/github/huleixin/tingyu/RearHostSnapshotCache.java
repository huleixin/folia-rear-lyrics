package io.github.huleixin.tingyu;

import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostSnapshotCache.java
/** One-second calibration plus invalidation. Full visual assets never ride every local clock read. */
final class RearHostSnapshotCache {
    interface Reader { String read(int revision)throws Exception; }
    private final Reader reader;
    private volatile long generation;
    private long acceptedGeneration=-1,fetchedAt=-2000;
    private int revision=-1;
    private JSONObject config,font;
    private String delta="{}";
    RearHostSnapshotCache(Reader reader){this.reader=reader;}
    void invalidate(){generation++;}
    synchronized String get(int requested,long now)throws Exception{
        if(generation!=acceptedGeneration || now-fetchedAt>=1000 || (requested<0&&config!=null)){
            JSONObject packet=null;long before=-1;
            for(int retry=0;retry<2;retry++){
                before=generation;packet=new JSONObject(reader.read(revision));
                if(before==generation)break;
                packet=null;
            }
            if(packet==null)throw new IllegalStateException("Playback changed during snapshot read");
            if(packet.has("config")){config=packet.optJSONObject("config");font=packet.optJSONObject("uploadedFont");}
            revision=packet.optInt("revision",-1);packet.remove("config");packet.remove("uploadedFont");
            delta=packet.toString();fetchedAt=now;acceptedGeneration=before;
        }
        if(requested!=revision&&config!=null)return new JSONObject(delta).put("config",config).put("uploadedFont",font==null?JSONObject.NULL:font).toString();
        return delta;
    }
}
