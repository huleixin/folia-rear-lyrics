package io.github.huleixin.tingyu.minimal

import org.json.JSONObject
import io.github.huleixin.tingyu.playback.NativePlaylist
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/minimal/IdentitySafeTrackTest.java
//
// 纯 JVM 单测：切歌交接期的四个混用场景，任何一条都不允许把两首歌的信息拼在一起。
// 覆盖 identitySafeTrack —— resolve() 唯一的元数据合并点。
class IdentitySafeTrackTest {

    private fun catalog(key: String, title: String, artist: String = "目录歌手", durationMs: Long = 0L) =
        NativePlaylist.Track(key, "qq", "media-$key", title, artist, "目录专辑", durationMs, "catalog-artwork", "")

    private fun bridge(
        trackKey: String,
        title: String = "桥歌名",
        artist: String = "桥歌手",
        durationSec: Double = 0.0,
        cover: String = "bridge-cover",
    ) = MinimalBridgeFrame(
        session = "s", trackKey = trackKey, title = title, artist = artist,
        cover = cover, durationSec = durationSec,
    )

    @Test
    fun `media3 已换歌但元数据为空时不得沿用旧桥帧的歌名`() {
        // nativeKey = 新歌 B，title 空；桥帧还在描述旧歌 A。
        val native = JSONObject().put("songKey", "qq:b").put("title", "").put("artist", "")
        val track = identitySafeTrack(
            key = "qq:b", engine = "media3", nativeKey = "qq:b", native = native,
            bridge = bridge("qq:a", title = "旧歌A", artist = "旧歌手A", durationSec = 180.0),
            catalogTrack = catalog("qq:b", "新歌B", durationMs = 200_000L),
        )
        assertEquals("qq:b", track.key)
        assertEquals("新歌B", track.title)
        assertEquals("目录歌手", track.artist)
        assertEquals(200_000L, track.durationMs)
        assertEquals("catalog-artwork", track.artwork)
    }

    @Test
    fun `桥帧与身份一致时仍可作为补齐来源`() {
        val native = JSONObject().put("songKey", "qq:a") // engine 非 media3：native 不说话
        val track = identitySafeTrack(
            key = "qq:a", engine = "", nativeKey = "", native = native,
            bridge = bridge("qq:a", title = "桥歌名", durationSec = 120.0),
            catalogTrack = null,
        )
        assertEquals("桥歌名", track.title)
        assertEquals("桥歌手", track.artist)
        assertEquals(120_000L, track.durationMs)
        assertEquals("bridge-cover", track.artwork)
    }

    @Test
    fun `身份完全未知时宁可留空也不混入旧歌`() {
        val native = JSONObject().put("songKey", "qq:b")
        val track = identitySafeTrack(
            key = "qq:b", engine = "media3", nativeKey = "qq:b", native = native,
            bridge = bridge("qq:a", title = "旧歌A"),
            catalogTrack = null,
        )
        assertEquals("", track.title)
        assertEquals("", track.artist)
        assertEquals(0L, track.durationMs)
    }

    @Test
    fun `media3 的原生元数据优先于同身份的桥帧`() {
        val native = JSONObject().put("songKey", "qq:a").put("title", "原生歌名").put("durationMs", 95_000L)
        val track = identitySafeTrack(
            key = "qq:a", engine = "media3", nativeKey = "qq:a", native = native,
            bridge = bridge("qq:a", title = "桥歌名", durationSec = 120.0),
            catalogTrack = catalog("qq:a", "目录歌名", durationMs = 200_000L),
        )
        assertEquals("原生歌名", track.title)
        assertEquals(95_000L, track.durationMs)
    }

    @Test
    fun `track 数据类不把空 key 当作在播`() {
        assertFalse(MinimalTrack().present)
        assertTrue(MinimalTrack(key = "qq:a").present)
    }
}
