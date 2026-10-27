package io.github.huleixin.tingyu;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/NativeAudioFoldersTest.java
public class NativeAudioFoldersTest {
    @Test public void retainsVolumeAndRelativeFolder() {
        assertEquals("external_primary/Music/Album", NativeAudioFolders.mediaFolder("Music/Album/", "external_primary", true));
        assertEquals("sdcard/Music/Album", NativeAudioFolders.mediaFolder("Music/Album/", "sdcard", true));
    }
    @Test public void usesParentOfLegacyFileWithoutInventingUnknownPaths() {
        assertEquals("/storage/sdcard/Music", NativeAudioFolders.mediaFolder("/storage/sdcard/Music/a.mp3", "", false));
        assertNull(NativeAudioFolders.mediaFolder(null, "", true));
    }
}
