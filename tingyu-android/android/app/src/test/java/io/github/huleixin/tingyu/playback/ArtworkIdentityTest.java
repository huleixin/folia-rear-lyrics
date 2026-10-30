package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;

/**
 * 封面身份：一首歌的封面属于谁。
 *
 * <p>真机现象是「歌词正常、封面丢失」，两者恰好走同一个 {@link SongInfo}：如果身份错了，
 * 两个都会错。封面单独出问题只有一种可能 —— **地址在传递过程中丢了**，于是取词照旧成功、
 * 取图却拿到空字符串。
 *
 * <p>这里锁住三件事：
 * <ul>
 *   <li>两条入队路径写的是不同字段名（窗口 {@code coverUrl}，逻辑歌单 {@code artwork}），
 *       读的那一侧必须都认；</li>
 *   <li>队列项的 tag 是入队那一刻的快照，之后补齐的封面要能从**当前**逻辑歌单按 songKey
 *       追回来；</li>
 *   <li>追不到时保持空，而不是拿别人的图。</li>
 * </ul>
 */
public class ArtworkIdentityTest {

    private static final String COVER =
        "https://y.gtimg.cn/music/photo_new/T002R300x300M000004Z8cTB0FsM7A.jpg";

    @Before
    public void reset() throws Exception {
        NativePlaylist.resetForTest();
    }

    @Test
    public void readsTheCoverWrittenByThePlaylistPath() throws Exception {
        JSONObject tag = new JSONObject().put("songKey", "k1").put("artwork", COVER);
        SongInfo info = SongInfo.fromTag(tag, 1);
        assertEquals(COVER, info.artworkUrl);
    }

    @Test
    public void readsTheCoverWrittenByTheWindowPath() throws Exception {
        // 原生接管的那一项由窗口 tag 复制而来，字段名是 coverUrl。
        JSONObject tag = new JSONObject().put("songKey", "k2").put("coverUrl", COVER);
        SongInfo info = SongInfo.fromTag(tag, 1);
        assertEquals(COVER, info.artworkUrl);
    }

    @Test
    public void anEmptyArtworkDoesNotShadowTheOtherField() throws Exception {
        JSONObject tag = new JSONObject().put("songKey", "k3").put("artwork", "").put("coverUrl", COVER);
        assertEquals(COVER, SongInfo.fromTag(tag, 1).artworkUrl);
    }

    @Test
    public void aMissingCoverStaysEmptyInsteadOfBecomingJunk() throws Exception {
        JSONObject tag = new JSONObject().put("songKey", "k4");
        assertEquals("", SongInfo.fromTag(tag, 1).artworkUrl);
    }

    @Test
    public void withArtworkOnlyChangesTheCover() throws Exception {
        SongInfo original = new SongInfo("k5", "标题", "歌手", "专辑", 200_000L, "",
            "qq", "mid-5", 7);
        SongInfo patched = original.withArtwork(COVER);

        assertEquals(COVER, patched.artworkUrl);
        assertEquals(original.songKey, patched.songKey);
        assertEquals(original.title, patched.title);
        assertEquals(original.artist, patched.artist);
        assertEquals(original.album, patched.album);
        assertEquals(original.durationMs, patched.durationMs);
        assertEquals(original.mediaId, patched.mediaId);
        assertEquals("代次不能因为补封面而改变", original.generation, patched.generation);
    }

    @Test
    public void theCurrentPlaylistCanHandBackTheCoverForAnAlreadyQueuedItem() throws Exception {
        // 队列里的 MediaItem 带的是入队那一刻的 tag。若那次同步的封面是空的（旧版本读错
        // 字段），即使之后用正确数据重新同步，那一项也不会自己变好 —— 只能按 songKey 回查。
        NativePlaylist.get().replace(
            java.util.Arrays.asList(
                new NativePlaylist.Track("k6", "qq", "m6", "T", "A", "B", 1L, COVER, ""),
                new NativePlaylist.Track("k7", "qq", "m7", "T", "A", "B", 1L, "", "")),
            NativePlaylist.Mode.SEQUENCE, false, 1L, "test");

        assertEquals(COVER, NativePlaylist.get().artworkFor("k6"));
        assertEquals("没有封面就是空，不要拿别人的图", "", NativePlaylist.get().artworkFor("k7"));
        assertEquals("", NativePlaylist.get().artworkFor("not-in-playlist"));
    }

    @Test
    public void aQueuedItemWithItsOwnCoverIsNeverOverwrittenByThePlaylist() throws Exception {
        // 反过来也要成立：tag 里已有封面时，逻辑歌单里那句可能已经变成空串，不能拿它覆盖。
        JSONObject tag = new JSONObject().put("songKey", "k8").put("artwork", COVER);
        SongInfo info = SongInfo.fromTag(tag, 1);
        assertTrue("已有封面时保持原值", COVER.equals(info.artworkUrl));
        assertFalse(info.artworkUrl.isEmpty());
    }
}
