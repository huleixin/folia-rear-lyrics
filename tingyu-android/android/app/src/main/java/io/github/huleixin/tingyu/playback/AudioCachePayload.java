package io.github.huleixin.tingyu.playback;

import org.json.JSONArray;
import org.json.JSONObject;

// Durable tasks keep catalog identifiers only; credential and resolved URL fields are excluded.
final class AudioCachePayload {
    static JSONObject sanitize(JSONObject raw)throws Exception {
        JSONObject safe=new JSONObject();
        for(String key:new String[]{"songKey","providerId","mediaId","sourceId","title","artist","album"})safe.put(key,raw.optString(key,"").substring(0,Math.min(raw.optString(key,"").length(),500)));
        safe.put("durationMs",PlaylistDuration.read(raw));
        Object value=raw.opt("providerData");JSONObject data=value instanceof JSONObject?(JSONObject)value:new JSONObject(value instanceof String?(String)value:"{}");
        JSONObject out=new JSONObject();
        String route=data.optString("audioCacheRoute","");if(route.matches("[a-f0-9]{64}"))out.put("audioCacheRoute",route);
        for(String key:new String[]{"songMid","songmid","songId","copyrightId","albumId","albumMid","strMediaMid","mediaMid","hash","albumAudioId","mixSongId","formats","lxPlatform"}) {
            Object item=data.opt(key);if(item instanceof Number||item instanceof String&&((String)item).length()<500&&!((String)item).contains("://"))out.put(key,item);
        }
        JSONArray names=new JSONArray(),artists=data.optJSONArray("fallbackArtists");
        if(artists!=null)for(int i=0;i<Math.min(20,artists.length());i++){String name=artists.optString(i,"");if(!name.isEmpty()&&name.length()<200)names.put(name);}out.put("fallbackArtists",names);
        JSONObject keys=new JSONObject(),inputKeys=data.optJSONObject("audioCacheKeys");
        for(String q:new String[]{"standard","high","lossless","hires"})if(inputKeys!=null){String key=inputKeys.optString(q,"");if(key.startsWith("offline_v1_")&&key.length()<2048)keys.put(q,key);}out.put("audioCacheKeys",keys);
        for(String field:new String[]{"_types","_qualitys"}){
            JSONObject map=data.optJSONObject(field),types=new JSONObject();
            if(map!=null)for(String q:new String[]{"128k","320k","flac","flac24bit"}){
                JSONObject t=map.optJSONObject(q),clean=new JSONObject();if(t==null)continue;
                for(String k:new String[]{"hash","size","type"}){Object v=t.opt(k);if(v instanceof Number||v instanceof String&&((String)v).length()<80&&!((String)v).contains("://"))clean.put(k,v);}types.put(q,clean);
            }out.put(field,types);
        }
        return safe.put("providerData",out);
    }
}
