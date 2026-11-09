package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearAodPreference.java
/** Unknown IPC results preserve the last explicit preference; a new host fails closed until read. */
final class RearAodPreference {
    private Boolean value;
    private boolean available;
    boolean update(Boolean read){available=read!=null;if(available)value=read;return enabled();}
    boolean enabled(){return Boolean.TRUE.equals(value);}
    String status(){return available?(enabled()?"enabled":"disabled"):value==null?"unknown":"unavailable-cached";}
}
