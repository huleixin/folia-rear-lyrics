package io.github.huleixin.tingyu;

import org.junit.Test;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/NativeTextDocumentTest.java
public class NativeTextDocumentTest {
    @Test public void readsUtf8ScriptWithoutChangingItsContents() throws Exception {
        String text = "\uFEFF/** @name 中文音源 */\nconst source = '✓';";
        assertEquals(text, NativeTextDocument.read(new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8))));
    }
    @Test public void acceptsExactLimitButRejectsLargerDocuments() throws Exception {
        assertEquals(NativeTextDocument.MAX_BYTES, NativeTextDocument.read(new ByteArrayInputStream(new byte[NativeTextDocument.MAX_BYTES])).length());
        try { NativeTextDocument.read(new ByteArrayInputStream(new byte[NativeTextDocument.MAX_BYTES+1])); fail("must reject oversize"); }
        catch(IOException expected) { assertTrue(expected.getMessage().contains("1 MB")); }
    }
    @Test(expected=IOException.class) public void reportsUnreadableDocument() throws Exception { NativeTextDocument.read(null); }
}
