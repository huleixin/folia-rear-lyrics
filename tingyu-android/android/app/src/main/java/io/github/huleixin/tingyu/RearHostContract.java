package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostContract.java
public final class RearHostContract {
    public static final String TARGET="com.xiaomi.subscreencenter";
    public static final String APP=BuildConfig.APPLICATION_ID;
    public static final String AUTHORITY=APP+".rearhost";
    public static final String REQUEST=APP+".rearhost.CONNECT";
    public static final String DESCRIPTOR=APP+".rearhost.v1";
    public static final int VERSION=1,SHOW=1,HIDE=2,SUSPEND=3,PROBE=4;
    private RearHostContract(){}
}
