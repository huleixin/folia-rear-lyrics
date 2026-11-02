package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearSystemCardPolicy.java
/** Business ownership and native navigation slot are separate from MediaController readiness. */
final class RearSystemCardPolicy {
    static boolean eligible(String pkg,String business,String creator,boolean center,boolean active,boolean bound){
        return "unified.music".equals(pkg)&&"music".equals(business)
            &&RearHostContract.APP.equals(creator)&&center&&active&&bound;
    }
    /** MainPanel's type-0 theme MAML is not a notification business record.
     * A real music_control with our selected session substitutes for absent notification fields;
     * explicit conflicting fields still veto ownership. */
    static boolean themeMusic(String pkg,String business,String creator,int type,String selected,
            boolean center,boolean active,boolean bound){
        return type==0&&RearHostContract.APP.equals(selected)&&center&&active&&bound
            &&(pkg==null||"unified.music".equals(pkg))
            &&(business==null||"music".equals(business))
            &&(creator==null||RearHostContract.APP.equals(creator));
    }
    private RearSystemCardPolicy(){}
}
