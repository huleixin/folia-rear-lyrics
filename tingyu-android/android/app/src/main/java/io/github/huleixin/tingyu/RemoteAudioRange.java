package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RemoteAudioRange.java
/** A chunked 206 still describes only the requested slice, never the entire file. */
final class RemoteAudioRange {
    static long bodyLength(String range){
        if(range==null)return -1;
        java.util.regex.Matcher match=java.util.regex.Pattern.compile("bytes ([0-9]+)-([0-9]+)/([0-9]+|\\*)").matcher(range.trim());
        if(!match.matches())return -1;
        try{long start=Long.parseLong(match.group(1)),end=Long.parseLong(match.group(2));return end>=start?Math.addExact(Math.subtractExact(end,start),1):-1;}
        catch(IllegalArgumentException|ArithmeticException ignored){return -1;}
    }
    private RemoteAudioRange(){}
}
