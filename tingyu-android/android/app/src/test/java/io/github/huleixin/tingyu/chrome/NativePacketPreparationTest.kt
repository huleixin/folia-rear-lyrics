package io.github.huleixin.tingyu.chrome

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativePacketPreparationTest.kt
class NativePacketPreparationTest {
    private fun frame(key:String)=JSONObject("""{"id":"settings","session":"one","generation":5,"revision":3,"enabled":true,"viewportWidth":393,"model":{"key":"$key","sections":[]},"navigation":"route:7"}""")
    @Test fun preparedPageRetainsOrderingAndNavigation(){
        val value=PreparedNativePage.parse(frame("settings:index"))
        assertEquals(5L,value.page.generation);assertEquals(3L,value.page.revision)
        assertEquals("route:7",value.navigation);assertNotNull(value.cache)
    }
    @Test fun formDocumentsAndTypedCredentialsAreNeverPersisted(){
        val value=PreparedNativePage.parse(frame("settings:document:accounts").apply{getJSONObject("model").put("password","private")})
        assertNull(value.cache)
    }
    @Test fun onlyInitialPublicListWindowsArePersisted(){
        val frame=frame("home:qq").put("id","home")
        frame.getJSONObject("model").getJSONArray("sections").put(JSONObject("""{"id":"recent","layout":"rows","offset":30,"items":[]}"""))
        assertNull(PreparedNativePage.parse(frame).cache)
    }
    @Test(expected=IllegalArgumentException::class) fun workerPreparationStillRejectsInvalidPackets(){
        PreparedNativePage.parse(frame("settings:index").put("viewportWidth",900000))
    }
}
