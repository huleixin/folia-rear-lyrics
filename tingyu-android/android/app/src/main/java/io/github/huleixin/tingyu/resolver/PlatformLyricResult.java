package io.github.huleixin.tingyu.resolver;

/**
 * Unified native result for original-platform lyric fetching.
 */
public final class PlatformLyricResult {

    public enum Status {
        OK,
        SOURCE_MISS,
        RATE_LIMITED,
        NETWORK_ERROR,
        IDENTITY_INCOMPLETE,
        UNSUPPORTED_SOURCE
    }

    public final Status status;
    public final String mainLrc;
    public final String transLrc;
    public final String rawWordLrc;
    public final String source;
    public final int httpStatus;

    private PlatformLyricResult(Status status, String mainLrc, String transLrc, String rawWordLrc,
                                String source, int httpStatus) {
        this.status = status;
        this.mainLrc = mainLrc == null ? "" : mainLrc;
        this.transLrc = transLrc == null ? "" : transLrc;
        this.rawWordLrc = rawWordLrc == null ? "" : rawWordLrc;
        this.source = source == null ? "" : source;
        this.httpStatus = httpStatus;
    }

    public static PlatformLyricResult ok(String mainLrc, String transLrc, String rawWordLrc, String source, int httpStatus) {
        return new PlatformLyricResult(Status.OK, mainLrc, transLrc, rawWordLrc, source, httpStatus);
    }

    public static PlatformLyricResult miss(String source, int httpStatus) {
        return new PlatformLyricResult(Status.SOURCE_MISS, "", "", "", source, httpStatus);
    }

    public static PlatformLyricResult rateLimited(String source, int httpStatus) {
        return new PlatformLyricResult(Status.RATE_LIMITED, "", "", "", source, httpStatus);
    }

    public static PlatformLyricResult networkError(String source, int httpStatus) {
        return new PlatformLyricResult(Status.NETWORK_ERROR, "", "", "", source, httpStatus);
    }

    public static PlatformLyricResult incomplete(String source) {
        return new PlatformLyricResult(Status.IDENTITY_INCOMPLETE, "", "", "", source, 0);
    }

    public static PlatformLyricResult unsupported(String source) {
        return new PlatformLyricResult(Status.UNSUPPORTED_SOURCE, "", "", "", source, 0);
    }
}
