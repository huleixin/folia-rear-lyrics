package io.github.huleixin.tingyu.resolver;

import java.util.Collections;
import java.util.Map;

/**
 * 一次地址解析的结果。
 *
 * 三种状态必须分开，不能合并成"失败"：
 * - {@link Status#OK}：拿到可播放地址；
 * - {@link Status#UNSUPPORTED}：**这个音源原生解析不了**（例如洛雪脚本是用户导入的 JS，
 *   只能在 WebView 里跑）。这不是错误，也不是重试能修的，调用方必须回落到原来的 JS 通道，
 *   并且不能把它说成"原生已支持"；
 * - {@link Status#FAILURE}：解析了，但这一次没拿到（网络、后端拒绝、地址缺失）。可以重试。
 */
public final class SourceResolution {

    public enum Status { OK, UNSUPPORTED, FAILURE }

    public final Status status;
    public final String url;
    public final String quality;
    /** 转发该地址时需要的请求头（多数音源为空）。 */
    public final Map<String, String> headers;
    /** UNSUPPORTED / FAILURE 的可解释原因，会原样进诊断报告。 */
    public final String reason;
    public final long fetchedAt;

    private SourceResolution(Status status, String url, String quality, Map<String, String> headers,
                             String reason, long fetchedAt) {
        this.status = status;
        this.url = url == null ? "" : url;
        this.quality = quality == null ? "" : quality;
        this.headers = headers == null ? Collections.emptyMap() : headers;
        this.reason = reason == null ? "" : reason;
        this.fetchedAt = fetchedAt;
    }

    public static SourceResolution ok(String url, String quality, long fetchedAt) {
        return new SourceResolution(Status.OK, url, quality, Collections.emptyMap(), "", fetchedAt);
    }

    public static SourceResolution ok(String url, String quality, Map<String, String> headers, long fetchedAt) {
        return new SourceResolution(Status.OK, url, quality, headers, "", fetchedAt);
    }

    public static SourceResolution unsupported(String reason) {
        return new SourceResolution(Status.UNSUPPORTED, "", "", Collections.emptyMap(), reason, 0L);
    }

    public static SourceResolution failure(String reason) {
        return new SourceResolution(Status.FAILURE, "", "", Collections.emptyMap(), reason, 0L);
    }

    public boolean ok() {
        return status == Status.OK;
    }

    @Override
    public String toString() {
        return "SourceResolution{" + status + (url.isEmpty() ? "" : " url=" + url.length() + "B")
            + (reason.isEmpty() ? "" : " reason=" + reason) + "}";
    }
}
