package io.github.huleixin.tingyu;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import android.util.Base64;
import java.io.File;
import java.nio.file.Files;
import java.lang.reflect.Field;
import java.util.Map;
import java.util.Arrays;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/SettingsFileChunkTest.java
// Exercise the real bridge with JSON-parsed offsets, rather than Java-created Long values.
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class SettingsFileChunkTest {
    @Rule public TemporaryFolder folder = new TemporaryFolder();
    private static class Call extends PluginCall {
        JSObject result; String error;
        Call(String json) throws Exception { super(null, "FoliaNative", "test", "readSettingsFileChunk", new JSObject(json)); }
        @Override public void resolve(JSObject data) { result = data; }
        @Override public void resolve() { result = new JSObject(); }
        @Override public void reject(String message) { error = message; }
        @Override public void reject(String message, Exception ex) { error = message; }
    }
    @SuppressWarnings("unchecked")
    private FoliaNativePlugin stage(byte[] content) throws Exception {
        FoliaNativePlugin plugin = new FoliaNativePlugin();
        File file = folder.newFile(); Files.write(file.toPath(), content);
        Field field = FoliaNativePlugin.class.getDeclaredField("pendingSettingsFiles"); field.setAccessible(true);
        ((Map<String, File>)field.get(plugin)).put("picked", file);
        return plugin;
    }
    @Test public void readsFirstMiddleAndFinalChunksUsingActualJsJsonIntegers() throws Exception {
        byte[] content = new byte[600123];
        for (int i = 0; i < content.length; i++) content[i] = (byte)(i * 31);
        FoliaNativePlugin plugin = stage(content);
        for (int offset = 0; offset < content.length; offset += 262144) {
            int length = Math.min(262144, content.length - offset);
            Call call = new Call("{\"id\":\"picked\",\"offset\":" + offset + ",\"length\":" + length + "}");
            assertTrue(call.getData().opt("offset") instanceof Integer);
            assertEquals(Long.valueOf(-1), call.getLong("offset", -1L)); // Old bridge rejected every chunk.
            plugin.readSettingsFileChunk(call);
            assertNull(call.error); assertNotNull(call.result);
            assertEquals(length, call.result.getInt("length"));
            assertArrayEquals(Arrays.copyOfRange(content, offset, offset + length), Base64.decode(call.result.getString("base64"), Base64.DEFAULT));
        }
        Call release = new Call("{\"ids\":[\"picked\"]}"); plugin.releaseSettingsFiles(release);
        Call retired = new Call("{\"id\":\"picked\",\"offset\":0,\"length\":1}");
        plugin.readSettingsFileChunk(retired); assertNotNull(retired.error);
    }
    @Test public void rejectsInvalidOffsetsMissingFilesAndUnboundedChunks() throws Exception {
        FoliaNativePlugin plugin = stage(new byte[4]);
        for (String offset : new String[]{"-1", "0.5", "\"0\"", "null", "5", "2147483648"}) {
            Call call = new Call("{\"id\":\"picked\",\"offset\":" + offset + ",\"length\":1}");
            plugin.readSettingsFileChunk(call); assertNotNull(offset, call.error); assertNull(call.result);
        }
        for (int length : new int[]{0, -1, 524289}) {
            Call call = new Call("{\"id\":\"picked\",\"offset\":0,\"length\":" + length + "}");
            plugin.readSettingsFileChunk(call); assertNotNull(call.error); assertNull(call.result);
        }
    }
}
