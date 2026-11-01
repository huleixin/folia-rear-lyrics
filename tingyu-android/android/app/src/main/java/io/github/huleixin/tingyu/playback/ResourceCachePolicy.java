package io.github.huleixin.tingyu.playback;

import java.net.URI;
import java.util.Locale;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/ResourceCachePolicy.java
/** Pure policy shared by disk IO, scheduling and tests. Unknown URL queries remain significant. */
public final class ResourceCachePolicy {
    public static final long ARTWORK_BYTES = 192L * 1024 * 1024;
    public static final long LYRICS_BYTES = 32L * 1024 * 1024;
    public static final int PAGE_SIZE = 50;
    public static final int AHEAD = 10;
    private ResourceCachePolicy() { }
    public static String artworkIdentity(String url) {
        try {
            URI uri = URI.create(url);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            String path = uri.getPath();
            if (host.matches("p\\d+\\.music\\.126\\.net")) return "netease:" + path;
            if (host.equals("y.gtimg.cn") || host.equals("y.qq.com"))
                return "qq:" + path.replaceAll("(T00[12])R\\d+x\\d+(M000)", "$1$2");
            if (host.endsWith(".kgimg.com") || host.endsWith(".kugou.com"))
                return host + ":" + path.replaceAll("(/stdmusic/)\\d+/", "$1*/");
            if (host.matches("img\\d*\\.kuwo\\.cn"))
                return host + ":" + path.replaceAll("(/star/(?:albumcover|starheads)/)\\d+/", "$1*/");
            return url;
        } catch (RuntimeException ignored) { return url; }
    }
    public static String artworkDownloadUrl(String url) {
        if (!sharedArtworkUrl(url)) return url;
        if (URI.create(url).getHost().matches("p\\d+\\.music\\.126\\.net")) {
            if (url.matches(".*[?&]param=.*")) return url.replaceAll("([?&])param=[^&#]*", "$1param=800y800");
            return url + (url.contains("?") ? "&" : "?") + "param=800y800";
        }
        return url.replaceAll("(T00[12])(?:R[0-9]+x[0-9]+)?(M000)", "$1R800x800$2")
            .replaceAll("(/stdmusic/)[0-9]+/", "$1800/")
            .replaceAll("(/star/(?:albumcover|starheads)/)[0-9]+/", "$1800/");
    }
    public static boolean sharedArtworkUrl(String url) {
        try {
            URI uri = URI.create(url);
            if (!"https".equals(uri.getScheme()) || uri.getUserInfo() != null) return false;
            String host = uri.getHost();
            String path = uri.getPath();
            return host != null && path != null && (
                ((host.equals("y.gtimg.cn") || host.equals("y.qq.com")) && path.matches(".*T00[12](R[0-9]+x[0-9]+)?M000.*"))
                || host.matches("p\\d+\\.music\\.126\\.net")
                || ((host.endsWith(".kgimg.com") || host.endsWith(".kugou.com")) && path.contains("/stdmusic/"))
                || (host.matches("img\\d*\\.kuwo\\.cn") && path.startsWith("/star/")));
        } catch (RuntimeException ignored) { return false; }
    }
    public static long retryNotBefore(String header, long now) {
        if (header != null) try { return now + Math.max(1000L, Math.multiplyExact(Long.parseLong(header.trim()), 1000L)); }
        catch (RuntimeException ignored) {
            try { return Math.max(now+1000L, new java.text.SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss z", Locale.US).parse(header).getTime()); }
            catch (Exception invalid) { }
        }
        return now + 5*60_000L;
    }
    public static boolean allowBulkNetwork(boolean enabled, boolean wifiOnly, boolean wifi, boolean metered, boolean restricted) {
        return enabled && (!wifiOnly || wifi) && (!metered || !restricted);
    }
    public static int priority(int distance) { return distance == 0 ? 0 : distance <= AHEAD && distance > 0 ? 1 : 2; }
    public static long retryDelay(int attempt, boolean rateLimited) {
        return rateLimited ? 5 * 60_000L : Math.min(5 * 60_000L, 30_000L << Math.min(4, Math.max(0, attempt)));
    }
}
