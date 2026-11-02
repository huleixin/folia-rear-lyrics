package io.github.huleixin.tingyu;

import java.util.List;
import java.util.Set;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearOwnMusicPackagesTest.java
public class RearOwnMusicPackagesTest {
    @Test public void preservesImmutableListOrderWithoutEnablingAnUnrequestedPackage(){
        List<String> input=List.of("com.existing.one","com.existing.two");
        List<Object> result=RearOwnMusicPackages.list(input);
        assertEquals(List.of("com.existing.one","com.existing.two",RearHostContract.APP),result);
        assertEquals(2,input.size());assertEquals(result,RearOwnMusicPackages.list(result));
    }
    @Test public void preservesSetAndAdmitsOnlyTingyu(){
        Set<String> input=Set.of("com.existing.player");
        Set<Object> result=RearOwnMusicPackages.set(input);
        assertEquals(Set.of("com.existing.player",RearHostContract.APP),result);
        assertEquals(Set.of("com.existing.player"),input);
    }
}
