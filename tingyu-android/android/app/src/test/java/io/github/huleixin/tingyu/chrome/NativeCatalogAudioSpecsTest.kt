package io.github.huleixin.tingyu.chrome

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativeCatalogAudioSpecsTest.kt
class NativeCatalogAudioSpecsTest {
    @Test fun compactScreensAndLargeFontsKeepRoomForTheArtistAndDuration() {
        assertEquals(1,catalogBadgeLimit(320,1f))
        assertEquals(1,catalogBadgeLimit(393,1.5f))
        assertEquals(2,catalogBadgeLimit(393,1f))
    }
    private fun parse(item:JSONObject):NativePageItem = NativePage.parse(JSONObject().put("id","collection").put("session","specs").put("viewportWidth",393)
        .put("model",JSONObject().put("key","collection:specs").put("sections",JSONArray().put(JSONObject().put("id","tracks").put("layout","rows").put("total",1)
            .put("items",JSONArray().put(item)))))).sections.single().items.single()
    @Test fun boundedBadgesAndTheirMeaningSurviveTheNativePageContract() {
        val item=parse(JSONObject().put("id","track").put("audioSpecs",JSONArray(listOf("Hi-Res","杜比","DTS"))).put("audioSpecsLabel","平台标注规格，不代表当前播放音质"))
        assertEquals(listOf("Hi-Res","杜比"),item.audioSpecs)
        assertTrue(item.audioSpecsLabel.contains("不代表"))
    }
    @Test fun oldCachedPagesAndMalformedArraysDoNotInventBadges() {
        assertTrue(parse(JSONObject().put("id","old")).audioSpecs.isEmpty())
        assertTrue(parse(JSONObject().put("id","invalid").put("audioSpecs",JSONArray().put(JSONObject.NULL).put(123))).audioSpecs.isEmpty())
    }
    @Test fun updatingTheSameTrackRefreshesItsBadgesWithoutInvalidatingItsRowIdentity() {
        val item=parse(JSONObject().put("id","track").put("audioSpecs",JSONArray(listOf("无损"))))
        val section=NativePageSection("tracks","","rows",listOf(item),"","","","","","","",false,1,0,"")
        val rows=NativeRowsCache();rows.accept(section)
        val updated=item.copy(audioSpecs=listOf("Hi-Res"))
        rows.accept(section.copy(items=listOf(updated)))
        assertEquals(listOf("Hi-Res"),rows.get(section.copy(items=emptyList(),offset=100),0)?.audioSpecs)
        assertEquals("track",updated.id)
    }
}
