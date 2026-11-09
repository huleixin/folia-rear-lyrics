package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearAodEvidenceGate.java
/** Event-driven, bounded diagnostic burst; never schedules a polling heartbeat. */
final class RearAodEvidenceGate {
    private String last="";
    private long start=-1;
    private int count,suppressed;
    boolean allow(String key,long now){
        if(key.equals(last))return false;
        if(start<0||now-start>=5000){start=now;count=0;}
        if(count>=12){suppressed++;return false;}
        count++;last=key;return true;
    }
    int takeSuppressed(){int value=suppressed;suppressed=0;return value;}
}
