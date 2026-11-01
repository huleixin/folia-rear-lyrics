package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/DecoderFallbackOffer.java
/** One bounded opportunity for a live renderer; never a permanent engine capability change. */
final class DecoderFallbackOffer {
    private String source="",key="";
    private long ticket=-1;
    static boolean decoderError(int code){switch(code){case 3001:case 3003:case 4001:case 4002:case 4003:case 4004:case 4005:case 5001:case 5002:return true;default:return false;}}
    void begin(String source,String key,long ticket){this.source=source;this.key=key;this.ticket=ticket;}
    boolean current(String source,String key,long ticket,long generation,boolean paused){return !paused&&this.ticket==ticket&&ticket==generation&&this.source.equals(source)&&this.key.equals(key);}
    void clear(){ticket=-1;source="";key="";}
}
