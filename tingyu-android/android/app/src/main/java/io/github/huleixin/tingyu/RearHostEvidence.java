package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostEvidence.java
/** Latest startup plus bounded outcomes, isolated from high-frequency power/lyric history. */
final class RearHostEvidence {
    static String append(String previous,String event,String entry) {
        if("host/connect-request".equals(event))previous="";
        StringBuilder result=new StringBuilder();
        String[] lines=previous.split("\n");
        // Preserve the beginning of cold startup as well as recent outcomes; power chatter must
        // not erase the evidence from before the user's double-tap.
        for(int i=0;i<lines.length;i++)if((i<32||i>=lines.length-63)&&!lines[i].isEmpty())result.append(lines[i]).append('\n');
        result.append(entry.substring(0,Math.min(entry.length(),900))).append('\n');
        return result.toString();
    }
    private RearHostEvidence(){}
}
