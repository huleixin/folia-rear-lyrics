package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearCardRenderPolicy.java
final class RearCardRenderPolicy {
    enum Mode { NORMAL, AOD, HIDDEN }
    static Mode mode(boolean current,boolean own,boolean visible,boolean suspended,boolean follow,boolean command,int power){
        if(!current||!own||!visible||suspended||power==0||power==1)return Mode.HIDDEN;
        if(command||power==3||power==4)return follow?Mode.AOD:Mode.HIDDEN;
        return power==2?Mode.NORMAL:Mode.HIDDEN;
    }
}
