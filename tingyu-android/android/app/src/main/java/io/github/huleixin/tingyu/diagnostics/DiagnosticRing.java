package io.github.huleixin.tingyu.diagnostics;

import java.util.ArrayList;
import java.util.List;

// android/app/src/main/java/io/github/huleixin/tingyu/diagnostics/DiagnosticRing.java
/**
 * 有界事件环形缓冲（纯 JVM，无 Android 依赖，便于单测）。
 *
 * <p>只存已经序列化好的一行 JSONL：入环本身不做任何解析，避免把 JSON 组装成本摊到调用线程上。
 * 满了以后覆盖最旧的一条 —— 诊断日志的价值在「最近发生了什么」，不在「从头到尾」。
 *
 * <p>线程安全：所有读写都在实例锁内。调用方是主线程、播放线程、写入线程三方，
 * 但临界区只有一次数组赋值，开销可以忽略。
 */
public final class DiagnosticRing {
    /** 默认容量。400 条约等于一次冷启动到退出之间的关键事件量。 */
    public static final int DEFAULT_CAPACITY = 400;

    private final String[] lines;
    private int cursor;
    private int count;

    public DiagnosticRing() {
        this(DEFAULT_CAPACITY);
    }

    public DiagnosticRing(int capacity) {
        if (capacity <= 0) throw new IllegalArgumentException("capacity must be positive");
        lines = new String[capacity];
    }

    public synchronized void add(String line) {
        if (line == null || line.isEmpty()) return;
        lines[cursor] = line;
        cursor = (cursor + 1) % lines.length;
        if (count < lines.length) count += 1;
    }

    public synchronized int size() {
        return count;
    }

    public synchronized int capacity() {
        return lines.length;
    }

    /** 最旧的在前，每行一条，末尾不带换行。 */
    public synchronized String jsonl() {
        if (count == 0) return "";
        StringBuilder out = new StringBuilder(count * 160);
        int start = (cursor - count + lines.length) % lines.length;
        for (int index = 0; index < count; index += 1) {
            String line = lines[(start + index) % lines.length];
            if (line == null) continue;
            if (out.length() > 0) out.append('\n');
            out.append(line);
        }
        return out.toString();
    }

    /** 最近 n 条，最旧的在前。 */
    public synchronized List<String> tail(int n) {
        List<String> out = new ArrayList<>();
        if (count == 0 || n <= 0) return out;
        int take = Math.min(n, count);
        int start = (cursor - take + lines.length) % lines.length;
        for (int index = 0; index < take; index += 1) {
            String line = lines[(start + index) % lines.length];
            if (line != null) out.add(line);
        }
        return out;
    }

    public synchronized void clear() {
        java.util.Arrays.fill(lines, null);
        cursor = 0;
        count = 0;
    }
}
