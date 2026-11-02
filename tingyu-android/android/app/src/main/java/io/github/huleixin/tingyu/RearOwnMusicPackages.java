package io.github.huleixin.tingyu;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

// android/app/src/main/java/io/github/huleixin/tingyu/RearOwnMusicPackages.java
/** Preserve every pre-existing admission and mutate no caller-owned or immutable collection. */
final class RearOwnMusicPackages {
    static List<Object> list(List<?> original){
        List<Object> result=new ArrayList<>(original);
        if(!result.contains(RearHostContract.APP))result.add(RearHostContract.APP);
        return result;
    }
    static Set<Object> set(Set<?> original){
        Set<Object> result=new HashSet<>(original);result.add(RearHostContract.APP);return result;
    }
    private RearOwnMusicPackages(){}
}
