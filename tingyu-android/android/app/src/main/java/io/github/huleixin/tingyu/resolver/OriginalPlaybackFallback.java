package io.github.huleixin.tingyu.resolver;

import io.github.huleixin.tingyu.playback.NativePlaylist;
import java.text.Normalizer;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.Future;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/resolver/OriginalPlaybackFallback.java
/** Bounded cross-provider recovery; returns audio only, never substitutes the logical queue track. */
final class OriginalPlaybackFallback {
    interface Catalog { List<NativePlaylist.Track> search(String provider, String query) throws Exception; }
    interface Resolver {
        boolean available(String provider);
        SourceResolution resolve(NativePlaylist.Track track, String quality);
    }
    // A transport ignoring interruption cannot accumulate unbounded background workers/queued jobs.
    private static final ThreadPoolExecutor WORK = new ThreadPoolExecutor(0, 2, 30, TimeUnit.SECONDS,
        new SynchronousQueue<>(), task -> { Thread thread = new Thread(task, "tingyu-backup-source"); thread.setDaemon(true); return thread; });
    private final Catalog catalog;
    OriginalPlaybackFallback(Catalog catalog) { this.catalog = catalog; }

    static String normalize(String text) {
        return Normalizer.normalize(text == null ? "" : text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT)
            .replaceAll("[\\s\\p{P}\\p{S}]", "");
    }
    private static Set<String> artists(NativePlaylist.Track track) {
        Set<String> result = new HashSet<>();
        try {
            JSONArray names = new JSONObject(track.providerData).optJSONArray("fallbackArtists");
            if (names != null) {
                for (int i = 0; i < names.length(); i++) { String name = normalize(names.optString(i)); if (!name.isEmpty()) result.add(name); }
                return result;
            }
        } catch (Exception ignored) { }
        // Legacy payloads have only a display label. Do not guess artist boundaries.
        if (!track.artist.contains(",") && !normalize(track.artist).isEmpty()) result.add(normalize(track.artist));
        return result;
    }
    static boolean eligible(NativePlaylist.Track track) {
        return track != null && track.prefersOriginal() && track.durationMs > 0 && !normalize(track.title).isEmpty()
            && !artists(track).isEmpty() && Set.of("qq", "netease", "kugou", "bodian", "qishui").contains(track.providerId);
    }
    static boolean matches(NativePlaylist.Track original, NativePlaylist.Track candidate) {
        Set<String> names = artists(original);
        return !normalize(original.title).isEmpty() && normalize(original.title).equals(normalize(candidate.title))
            && !names.isEmpty() && names.equals(artists(candidate)) && original.durationMs > 0 && candidate.durationMs > 0
            && Math.abs(original.durationMs - candidate.durationMs) <= Math.min(5000, original.durationMs * .03);
    }
    private static <T> T bounded(Callable<T> work, long timeout) throws Exception {
        Future<T> future = WORK.submit(work);
        try { return future.get(Math.max(1, timeout), TimeUnit.MILLISECONDS); }
        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw interrupted; }
        finally { if (!future.isDone()) future.cancel(true); }
    }
    SourceResolution resolve(NativePlaylist.Track original, String quality, Resolver resolver) {
        if (!eligible(original)) return SourceResolution.failure("backup not applicable");
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
        int attempts = 0;
        for (String provider : new String[] { "qq", "netease" }) {
            if (provider.equals(original.providerId) || !resolver.available(provider)) continue;
            long remaining = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime());
            if (remaining <= 0 || Thread.currentThread().isInterrupted()) break;
            try {
                String query = original.title + " " + String.join(" ", artists(original));
                List<NativePlaylist.Track> songs = bounded(() -> catalog.search(provider, query), Math.min(5000, remaining));
                int perProvider = 0;
                for (NativePlaylist.Track candidate : songs) {
                    if (!provider.equals(candidate.providerId) || !matches(original, candidate)) continue;
                    if (perProvider++ >= 2 || attempts++ >= 4) break;
                    remaining = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime());
                    if (remaining <= 0 || Thread.currentThread().isInterrupted()) break;
                    try {
                        SourceResolution result = bounded(() -> resolver.resolve(candidate, quality), Math.min(6000, remaining));
                        if (result != null && result.ok() && (result.url.startsWith("https://") || result.url.startsWith("http://")))
                            return result.asBackup(candidate.providerId);
                    } catch (Exception ignored) { if (Thread.currentThread().isInterrupted()) break; }
                }
            } catch (Exception ignored) { if (Thread.currentThread().isInterrupted()) break; }
        }
        return SourceResolution.failure("no matching playable backup");
    }
}
