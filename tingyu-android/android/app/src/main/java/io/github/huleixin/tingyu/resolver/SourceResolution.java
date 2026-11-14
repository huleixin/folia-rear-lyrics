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
    /**
     * 这个地址是否应当经本地代理（LocalAudioServer）转交给播放器。
     *
     * 判据是**与前台同构**：前台 JS 侧对 kuwo/网易/波点/洛雪/汽水都会先走
     * {@code proxyNativeRemoteAudioUrl}（那些 CDN 需要代理补的 Referer/UA，或 <audio>
     * 需要 CORS），后台续播也必须走同一条路；而 QQ 的前台链路把 CDN 直链直接交给
     * Media3（QQ CDN 不在代理的调用方名单里），后台若把它塞进代理，代理会用 kuwo 的
     * Referer 去请求 QQ CDN —— 请求形态与前台完全不同，CDN 拒收后代理包一层 502
     * （真机 1.3.182：后台 QQ 连续 31 次 502 @127.0.0.1，回前台直连立刻恢复）。
     * 所以解析器必须自己声明：QQ 系地址直连，其余默认代理。
     */
    public final boolean proxied;
    /** Actual provider when a matching backup supplies the audio; logical song identity is unchanged. */
    public final String backupProviderId;

    private SourceResolution(Status status, String url, String quality, Map<String, String> headers,
                             String reason, long fetchedAt, boolean proxied) {
        this(status, url, quality, headers, reason, fetchedAt, proxied, "");
    }

    private SourceResolution(Status status, String url, String quality, Map<String, String> headers,
                             String reason, long fetchedAt, boolean proxied, String backupProviderId) {
        this.status = status;
        this.url = url == null ? "" : url;
        this.quality = quality == null ? "" : quality;
        this.headers = headers == null ? Collections.emptyMap() : headers;
        this.reason = reason == null ? "" : reason;
        this.fetchedAt = fetchedAt;
        this.proxied = proxied;
        this.backupProviderId = backupProviderId;
    }

    SourceResolution asBackup(String providerId) {
        return new SourceResolution(status, url, quality, headers, reason, fetchedAt, proxied, providerId);
    }

    public static SourceResolution ok(String url, String quality, long fetchedAt) {
        return new SourceResolution(Status.OK, url, quality, Collections.emptyMap(), "", fetchedAt, true);
    }

    public static SourceResolution ok(String url, String quality, Map<String, String> headers, long fetchedAt) {
        return new SourceResolution(Status.OK, url, quality, headers, "", fetchedAt, true);
    }

    /** 解析成功，且**不走本地代理**：播放器直接连该地址（与前台直连行为同构）。 */
    public static SourceResolution okDirect(String url, String quality, long fetchedAt) {
        return new SourceResolution(Status.OK, url, quality, Collections.emptyMap(), "", fetchedAt, false);
    }

    public static SourceResolution unsupported(String reason) {
        return new SourceResolution(Status.UNSUPPORTED, "", "", Collections.emptyMap(), reason, 0L, true);
    }

    public static SourceResolution failure(String reason) {
        return new SourceResolution(Status.FAILURE, "", "", Collections.emptyMap(), reason, 0L, true);
    }

    public boolean ok() {
        return status == Status.OK;
    }

    /** 该地址交给播放器前是否要先在本地代理登记（见 {@link #proxied}）。 */
    public boolean proxy() {
        return proxied;
    }

    @Override
    public String toString() {
        return "SourceResolution{" + status + (url.isEmpty() ? "" : " url=" + url.length() + "B")
            + (reason.isEmpty() ? "" : " reason=" + reason) + "}";
    }
}
