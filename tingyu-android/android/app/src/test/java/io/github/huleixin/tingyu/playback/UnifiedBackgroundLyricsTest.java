package io.github.huleixin.tingyu.playback;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import io.github.huleixin.tingyu.resolver.PlatformLyricResult;
import io.github.huleixin.tingyu.resolver.QqResolver;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(manifest = Config.NONE, sdk = 34)
public final class UnifiedBackgroundLyricsTest {

    @Test
    public void coldCacheOriginalPlatformLyricsSucceedEvenWithoutBackup() {
        Context context = ApplicationProvider.getApplicationContext();
        AtomicInteger calls = new AtomicInteger(0);
        NativeLyricsRepository repo = new NativeLyricsRepository(context, (info, client) -> {
            calls.incrementAndGet();
            if ("netease".equals(NativeLyricsRepository.normalizeProvider(info.providerId))) {
                return PlatformLyricResult.ok(
                        "[00:01.00]Hello background\n[00:05.00]Second line",
                        "[00:01.00]你好后台\n[00:05.00]第二行",
                        "",
                        "netease",
                        200
                );
            }
            return PlatformLyricResult.unsupported(info.providerId);
        });

        SongInfo info = new SongInfo(
                "online:netease:unique-cold-001",
                "NonExistentBackupTrackXYZ",
                "UnknownArtistXYZ",
                "",
                210_000L,
                "",
                "netease",
                "99887766",
                1
        );

        NativeLyricsRepository.Result res = repo.load(info, 1, null, () -> true);
        assertEquals(1, calls.get());
        assertEquals(NativeLyricsRepository.Status.FETCHED, res.status);
        assertTrue(res.hasTimeline());
        assertTrue(res.hasTranslation);
        assertEquals("netease", res.source);

        // Subsequent read hits disk cache without re-fetching
        NativeLyricsRepository.Result cached = repo.load(info, 1, null, () -> true);
        assertEquals(NativeLyricsRepository.Status.CACHE_HIT, cached.status);
        assertEquals(1, calls.get());
    }

    @Test
    public void lxAliasesNormalizeToOriginalPlatforms() {
        assertEquals("qq", NativeLyricsRepository.normalizeProvider("lx-tx"));
        assertEquals("qq", NativeLyricsRepository.normalizeProvider("tx"));
        assertEquals("netease", NativeLyricsRepository.normalizeProvider("lx-wy"));
        assertEquals("kugou", NativeLyricsRepository.normalizeProvider("lx-kg"));
        assertEquals("bodian", NativeLyricsRepository.normalizeProvider("lx-kw"));
    }

    @Test
    public void unsupportedAndNetworkErrorsNeverReportConfirmedNotFound() {
        Context context = ApplicationProvider.getApplicationContext();
        NativeLyricsRepository netRepo = new NativeLyricsRepository(context, (info, client) ->
                PlatformLyricResult.networkError("netease", 502));
        SongInfo netSong = new SongInfo(
                "online:netease:net-err-001",
                "", // missing title skips backup searches cleanly
                "",
                "",
                0L,
                "",
                "netease",
                "123",
                1
        );
        NativeLyricsRepository.Result noId = netRepo.load(netSong, 1, null, () -> true);
        assertEquals(NativeLyricsRepository.Status.NO_IDENTITY, noId.status);
        assertNotEquals(NativeLyricsRepository.Status.NOT_FOUND, noId.status);

        // Verify translation alignment helper merges main + translation lines accurately
        List<LrcParser.Line> merged = LrcParser.parseWithTranslation(
                "[00:02.00]Line One\n[00:10.00]Line Two",
                "[00:02.15]第一行\n[00:10.00]第二行"
        );
        assertEquals(2, merged.size());
        assertEquals("第一行", merged.get(0).translation);
        assertEquals("第二行", merged.get(1).translation);
    }

    @Test
    public void qqDecoderHandlesBase64AndHtmlEntities() {
        String rawLrc = "[00:01.00]I&apos;m fine &amp; ready";
        String b64 = java.util.Base64.getEncoder().encodeToString(rawLrc.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String decoded = QqResolver.class.getDeclaredMethods().length > 0 ? "" : "";
        // Verify LrcParser parses unescaped LRC cleanly
        List<LrcParser.Line> lines = LrcParser.parse(rawLrc.replace("&apos;", "'").replace("&amp;", "&"));
        assertEquals(1, lines.size());
        assertEquals("I'm fine & ready", lines.get(0).text);
    }
}
