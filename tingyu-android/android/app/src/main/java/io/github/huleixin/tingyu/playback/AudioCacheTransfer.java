package io.github.huleixin.tingyu.playback;

import java.io.IOException;
import java.io.InputStream;
import java.util.function.BooleanSupplier;
import java.util.function.LongConsumer;

// Drain the existing cache tee without sleeping after each short Okio read.
final class AudioCacheTransfer {
    static long drain(InputStream input, long limit, BooleanSupplier cancelled, LongConsumer progress)
            throws IOException, InterruptedException {
        byte[] buffer = new byte[65536];
        long bytes = 0, next = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (cancelled.getAsBoolean() || Thread.currentThread().isInterrupted()) throw new InterruptedException();
            bytes += count;
            if (bytes > limit) throw new IOException("file limit");
            if (bytes >= next) { progress.accept(bytes); next = bytes + 1024 * 1024; }
        }
        progress.accept(bytes);
        return bytes;
    }
    static String reason(Exception error, String stage) {
        if (error instanceof java.net.SocketTimeoutException || error instanceof java.io.InterruptedIOException)
            return "下载超时，请检查网络后重试";
        if (error instanceof java.net.SocketException) return "下载连接中断，请重试";
        if ("resolve".equals(stage)) return "音源未返回可用音频，请重试或更换音源";
        if ("verify".equals(stage)) return "音频未通过完整性或格式检查，请重试";
        if ("file limit".equals(error.getMessage())) return "音频超过单文件大小上限";
        return "音频下载失败，请检查网络后重试";
    }
}
