package io.github.huleixin.tingyu.lsp;

import org.junit.Test;
import java.util.Arrays;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/lsp/RearTaskMetadataTest.java
public class RearTaskMetadataTest {
    public static final class Component {
        private final String pkg, name;
        Component(String pkg, String name) { this.pkg=pkg; this.name=name; }
        public String getPackageName() { return pkg; }
        public String getClassName() { return name; }
        public String flattenToShortString() { return pkg + "/" + name; }
    }
    // Deliberately does not extend RunningTaskInfo, matching Android's RootTaskInfo hierarchy.
    public static final class Root {
        public int taskId=201, userId=0;
        public int[] childTaskIds={88};
        public boolean visible=true;
        public Component baseActivity=new Component(RearBridgeContract.PACKAGE,RearBridgeContract.ACTIVITY);
        public Component topActivity=baseActivity;
    }
    @Test public void mapsOnlyOwnedLeafTaskToRootWithoutInvalidCast() throws Exception {
        assertEquals(201,RearTaskMetadata.ownedRoot(Arrays.asList(new Root()),88,0));
        assertTrue(RearTaskMetadata.front(Arrays.asList(new Root())).startsWith("88 "));
    }
    @Test(expected=SecurityException.class) public void cannotMoveSharedRoot() throws Exception {
        Root root=new Root(); root.childTaskIds=new int[]{88,89};
        RearTaskMetadata.ownedRoot(Arrays.asList(root),88,0);
    }
    @Test(expected=SecurityException.class) public void cannotMoveAnotherProfile() throws Exception {
        RearTaskMetadata.ownedRoot(Arrays.asList(new Root()),88,10);
    }
    @Test(expected=SecurityException.class) public void cannotMoveAnotherActivity() throws Exception {
        Root root=new Root(); root.baseActivity=new Component(RearBridgeContract.PACKAGE,"MainActivity");
        RearTaskMetadata.ownedRoot(Arrays.asList(root),88,0);
    }
    @Test public void ignoresHiddenRoots() throws Exception {
        Root root=new Root(); root.visible=false;
        assertEquals("-1 unknown",RearTaskMetadata.front(Arrays.asList(root)));
    }
}
