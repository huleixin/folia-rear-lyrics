package io.github.huleixin.tingyu;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

// android/app/src/main/java/io/github/huleixin/tingyu/NativeTextDocument.java
// Read only the document explicitly selected by the user, with a bounded allocation.
public final class NativeTextDocument {
    public static final int MAX_BYTES = 1024 * 1024;
    private NativeTextDocument() {}
    public static String read(InputStream input) throws IOException {
        if (input == null) throw new IOException("无法读取所选文件");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        for (int count; (count = input.read(buffer)) != -1;) {
            if (output.size() + count > MAX_BYTES) throw new IOException("音源脚本不能超过 1 MB");
            output.write(buffer, 0, count);
        }
        return output.toString(StandardCharsets.UTF_8.name());
    }
}
