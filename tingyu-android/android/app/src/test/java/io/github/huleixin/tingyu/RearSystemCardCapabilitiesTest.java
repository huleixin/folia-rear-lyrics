package io.github.huleixin.tingyu;

import org.junit.Test;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.HashSet;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearSystemCardCapabilitiesTest.java
public class RearSystemCardCapabilitiesTest {
    static class Shape {
        ArrayList<Object> holders;
        boolean active;
        static List<Object> shared;
        public void bind(int a,int b,int c,int d,Runnable done){}
        public HashSet<String> packages(){return null;}
        public boolean wrongBind(){return false;}
    }
    @Test public void checksDeclaredFieldTypesAndRejectsStaticOrMissingState() throws Exception {
        RearSystemCardCapabilities.field(Shape.class,"holders",List.class);
        RearSystemCardCapabilities.field(Shape.class,"active",boolean.class);
        assertThrows(IllegalStateException.class,()->RearSystemCardCapabilities.field(Shape.class,"holders",Set.class));
        assertThrows(IllegalStateException.class,()->RearSystemCardCapabilities.field(Shape.class,"shared",List.class));
        assertThrows(NoSuchFieldException.class,()->RearSystemCardCapabilities.field(Shape.class,"absent",List.class));
    }
    @Test public void exactMethodArgumentsAndReturnTypesAreRequired() throws Exception {
        RearSystemCardCapabilities.method(Shape.class,"bind",void.class,int.class,int.class,int.class,int.class,Runnable.class);
        RearSystemCardCapabilities.method(Shape.class,"packages",Set.class);
        assertThrows(NoSuchMethodException.class,()->RearSystemCardCapabilities.method(Shape.class,"bind",void.class,Runnable.class));
        assertThrows(IllegalStateException.class,()->RearSystemCardCapabilities.method(Shape.class,"wrongBind",void.class));
    }
    @Test public void unsupportedLoaderIsInspectedOnceWithoutVersionBasedAdmission(){
        int[] calls={0};ClassLoader missing=new ClassLoader(null){@Override public Class<?> loadClass(String name)throws ClassNotFoundException{calls[0]++;throw new ClassNotFoundException(name);}};
        List<RearSystemCardProfile> first=RearSystemCardCapabilities.verified(missing);int count=calls[0];
        assertTrue(first.isEmpty());assertTrue(count>0);assertSame(first,RearSystemCardCapabilities.verified(missing));assertEquals(count,calls[0]);
        assertNull(RearSystemCardProfile.choose(426092316L,first));
    }
}
