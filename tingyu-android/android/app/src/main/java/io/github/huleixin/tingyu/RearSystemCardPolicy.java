package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearSystemCardPolicy.java
/** Business ownership and native navigation slot are separate from MediaController readiness. */
final class RearSystemCardPolicy {
    static boolean eligible(String pkg,String business,String creator,String mediaPackage,boolean center,boolean active,boolean bound){
        return "unified.music".equals(pkg)&&"music".equals(business)
            &&RearHostContract.APP.equals(mediaPackage)
            &&(RearHostContract.APP.equals(creator)||"unified.music".equals(creator))&&center&&active&&bound;
    }
    /** Registered business can remain available while collapsed; this is not a rendered frame. */
    static boolean registered(String pkg,String business,String creator,String mediaPackage,boolean serviceEnabled){
        return serviceEnabled&&eligible(pkg,business,creator,mediaPackage,true,true,true);
    }
    private RearSystemCardPolicy(){}
}
