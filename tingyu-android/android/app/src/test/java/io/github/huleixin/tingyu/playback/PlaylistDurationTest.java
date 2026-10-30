package io.github.huleixin.tingyu.playback;

import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/PlaylistDurationTest.java
/**
 * 一个字段的单位就是这次 00:00 的全部原因，所以它值得有自己的一组断言。
 *
 * 200 秒的歌必须读成 200000ms；旧格式（秒）必须迁移；一个已经像毫秒的旧值绝不能被
 * 再放大一次（否则 300000ms 会变成 83 小时）。
 */
public class PlaylistDurationTest {

    @Test public void millisecondsFieldIsUsedAsIs() throws Exception {
        JSONObject raw = new JSONObject().put("durationMs", 252_000);
        assertEquals(252_000L, PlaylistDuration.read(raw));
    }

    /** 真机那一首《阿拉斯加海湾》：252 秒，必须发布成 252000ms。 */
    @Test public void a200SecondSongBecomes200000Milliseconds() throws Exception {
        JSONObject raw = new JSONObject().put("durationMs", 200_000);
        assertEquals(200_000L, PlaylistDuration.read(raw));
        assertEquals(200_000L, PlaylistDuration.read(new JSONObject().put("duration", 200)));
    }

    @Test public void legacySecondsAreMigrated() throws Exception {
        assertEquals(200_000L, PlaylistDuration.read(new JSONObject().put("duration", 200)));
        assertEquals(1_000L, PlaylistDuration.read(new JSONObject().put("duration", 1)));
    }

    /** 旧数据里也可能存的已经是毫秒 —— 不能再乘 1000。 */
    @Test public void aLegacyValueThatIsObviouslyMillisecondsIsNotScaledAgain() throws Exception {
        assertEquals(300_000L, PlaylistDuration.read(new JSONObject().put("duration", 300_000)));
    }

    @Test public void millisecondsFieldWinsOverALegacyField() throws Exception {
        JSONObject raw = new JSONObject().put("durationMs", 252_000).put("duration", 252);
        assertEquals(252_000L, PlaylistDuration.read(raw));
    }

    @Test public void anUnknownDurationStaysZero() throws Exception {
        assertEquals(0L, PlaylistDuration.read(new JSONObject()));
        assertEquals(0L, PlaylistDuration.read(new JSONObject().put("durationMs", 0)));
        assertEquals(0L, PlaylistDuration.read(new JSONObject().put("duration", -5)));
        assertEquals(0L, PlaylistDuration.read(null));
    }
}
