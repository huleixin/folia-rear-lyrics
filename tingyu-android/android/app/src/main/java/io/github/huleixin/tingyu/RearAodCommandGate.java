package io.github.huleixin.tingyu;

// RearAodCommandGate.java: a lost exit callback cannot hide a verified awake card forever.
final class RearAodCommandGate {
    static final long SETTLE_MS=1500;
    private boolean command;
    private long received;
    void command(boolean value,long now){if(value&&!command)received=now;command=value;}
    boolean effective(boolean rearOn,boolean mainAwakeUnlocked,boolean verifiedCard,long now){
        if(command&&rearOn&&mainAwakeUnlocked&&verifiedCard&&now-received>=SETTLE_MS)command=false;
        return command;
    }
}
