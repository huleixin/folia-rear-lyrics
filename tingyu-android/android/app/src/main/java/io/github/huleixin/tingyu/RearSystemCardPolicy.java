package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearSystemCardPolicy.java
/** Business ownership and native navigation slot are separate from MediaController readiness. */
final class RearSystemCardPolicy {
    static boolean eligible(String pkg,String business,String creator,boolean center,boolean active,boolean bound){
        return "unified.music".equals(pkg)&&"music".equals(business)
            &&RearHostContract.APP.equals(creator)&&center&&active&&bound;
    }
    private RearSystemCardPolicy(){}
}
