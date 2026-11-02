package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearSystemCardProfile.java
/** Versioned mappings verified against both user-provided system APKs, never version ranges. */
final class RearSystemCardProfile {
    final long version;
    final String bindMethod,holderClass,widgetClass;
    private RearSystemCardProfile(long version,String method,String holder,String widget){
        this.version=version;bindMethod=method;holderClass=holder;widgetClass=widget;
    }
    static final RearSystemCardProfile JANUARY=new RearSystemCardProfile(26010521L,"n","Z1.s0","r2.r");
    static final RearSystemCardProfile SEPTEMBER=new RearSystemCardProfile(426091419L,"y","k2.o0","E2.w");
    static RearSystemCardProfile forVersion(long version){
        if(version==JANUARY.version)return JANUARY;
        if(version==SEPTEMBER.version)return SEPTEMBER;
        return null;
    }
    boolean matchesTypes(Class<?> holder,Class<?> widget){
        if(!holderClass.equals(holder.getName()))return false;
        for(Class<?> type=widget;type!=null;type=type.getSuperclass())if(widgetClass.equals(type.getName()))return true;
        return false;
    }
}
