package io.github.huleixin.tingyu.chrome

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativePageRetentionTest.kt
class NativePageRetentionTest {
    private fun page(key:String,id:String=key.substringBefore(":"),enabled:Boolean=true,session:String="old")=NativePage.parse(JSONObject("""{
        "id":"$id","session":"$session","enabled":$enabled,"viewportWidth":393,"width":393,"height":852,
        "model":{"key":"$key","sections":[],"document":${if(key.startsWith("settings:document:"))"{\"paints\":[],\"controls\":[]}"else"null"}}
    }"""))
    @Test fun disabledAndRemovedAdaptersDoNotEraseTheReturnPresentation(){
        val frames=NativePageRetention();val home=page("home:qq");frames.update(home)
        frames.update(home.copy(enabled=false))
        assertEquals(home,frames.find("home",0,""))
        assertNull(frames.find("home",1,""))
        assertEquals("old",frames.find("home",0,"")?.session)
    }
    @Test fun settingsIndexAndEditorsHaveSeparateReturnIdentities(){
        val frames=NativePageRetention();val index=page("settings:index");val editor=page("settings:document:options:appearance:true:false:false:false:false:false")
        frames.update(index);frames.update(editor)
        assertEquals(index,frames.find("settings",0,"settings:index"))
        assertEquals(editor,frames.find("settings",0,editor.key))
        assertNull(frames.find("settings",0,"settings:document:options:playback:"))
        assertFalse(frames.update(page("settings:loading:playback")))
        assertFalse(frames.update(editor.copy(document=null)))
    }
    @Test fun delayedPacketsCannotReplaceANewerRouteEvenWhenTheSurfaceIdMatches(){
        val editor=page("settings:document:options:appearance:true:false:false:false:false:false")
        assertFalse(pageBelongsToRoute(editor,"settings",0,"settings:index","nav:3","nav:4"))
        assertFalse(pageBelongsToRoute(editor,"settings",0,"settings:index","nav:4","nav:4"))
        assertFalse(pageBelongsToRoute(editor,"stage",0,"","nav:4","nav:4"))
        assertTrue(pageBelongsToRoute(page("settings:document:rear-guide"),"settings",0,"settings:index","nav:4","nav:4"))
        assertTrue(pageBelongsToRoute(editor,"settings",0,"settings:document:options:appearance:","nav:4","nav:4"))
    }
    @Test fun returningToAnotherPlaylistCannotBrieflyReplayTheLastPlaylist(){
        val frames=NativePageRetention();frames.update(page("collection:online:qq:playlist:a"));frames.update(page("collection:online:qq:playlist:b"))
        assertEquals("collection:online:qq:playlist:a",frames.find("collection",0,"collection:online:qq:playlist:a")?.key)
        assertNull(frames.find("collection",0,"collection:online:qq:playlist:c"))
    }
    @Test fun visitedPageHistoryGivesAllReturnPathsTheSameReverseMotion(){
        val motion=NativeRouteMotion()
        assertFalse(motion.visit("home:qq"));assertFalse(motion.visit("stage"));assertFalse(motion.visit("settings:editor"))
        assertTrue(motion.visit("stage"));assertTrue(motion.visit("home:qq"))
        assertFalse(motion.visit("settings:index"));assertFalse(motion.visit("settings:section"));assertFalse(motion.visit("settings:nested"))
        assertTrue(motion.visit("settings:section"));assertTrue(motion.visit("settings:index"));assertTrue(motion.visit("home:qq"))
    }
    @Test fun snapshotsAreBoundedAndClearedWithTheHost(){
        val frames=NativePageRetention(2);frames.update(page("home:a"));frames.update(page("home:b"));frames.update(page("home:c"))
        assertNull(frames.find("home",0,"home:a"));frames.clear();assertNull(frames.find("home",0,""))
    }
    @Test fun anOutgoingHomeMeasurementCannotPoisonReturnGeometry(){
        val frames=NativePageRetention();val home=page("home:qq")
        assertTrue(frames.updateForRoute(home,"home",0,"","nav:1","nav:1"))
        val stale=home.copy(rect=home.rect.copy(top=32f))
        assertFalse(frames.updateForRoute(stale,"stage",0,"","nav:2","nav:2"))
        assertFalse(frames.updateForRoute(stale,"home",0,"","nav:1","nav:3"))
        assertEquals(home.rect,frames.find("home",0,"")?.rect)
    }
}
