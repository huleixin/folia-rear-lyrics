package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearNativeCardPolicy.java
/** Runtime instance evidence is mandatory. Neither launcher visibility nor Binder proves a card. */
final class RearNativeCardPolicy {
    static boolean ownMedia(String pkg){return RearHostContract.APP.equals(pkg);}
    static String blocker(boolean music,String pkg,boolean restore){
        if(!music)return "native music card unavailable";
        if(pkg==null)return "music card has no selected MediaController";
        if(!ownMedia(pkg))return "music card belongs to another app; takeover prohibited";
        if(!restore)return "own music card found but symmetric restoration APIs incomplete";
        return "own native music card instance verified; read-only probe, renderer takeover not enabled";
    }
}
