package io.github.huleixin.tingyu.chrome

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativeSettingsDocumentModelTest.kt
class NativeSettingsDocumentModelTest {
    @Test fun preservesFormValuesAndIndependentScrollWindows(){
        val doc=NativeSettingsDocument.parse(JSONObject("""{"paints":[{"kind":"text","x":20,"y":1200,"w":100,"h":20,"text":"原有设置","font":13}],"controls":[{"id":"volume","kind":"range","x":20,"y":1300,"w":200,"h":12,"value":"0.75","min":0,"max":1,"step":0.01}],"areas":[{"id":"logs","x":0,"y":90,"w":393,"h":600,"contentHeight":180000,"offset":24000}],"live":[{"x":10,"y":100,"w":300,"h":200}]}"""))
        assertEquals("原有设置",doc.paints.single().text);assertEquals(13f,doc.paints.single().font,.001f)
        assertEquals(.01f,doc.controls.single().step,.001f);assertEquals(180000f,doc.areas.single().contentHeight,.001f)
        assertEquals(24000,doc.areas.single().offset);assertTrue(doc.live.single().contains(20f,110f))
    }
    @Test fun boundsUntrustedGeometry(){
        val rect=SettingRect.parse(JSONObject("""{"x":2,"y":3,"w":-20,"h":99999999}"""))
        assertEquals(0f,rect.w,.001f);assertEquals(30000f,rect.h,.001f)
    }
    @Test fun editingDoesNotDismissTheNativeKeyboard(){
        val page=NativePage.parse(JSONObject("""{"id":"settings","session":"test","viewportWidth":393,"width":393,"height":852,"model":{"key":"settings:document:general","sections":[],"document":{"controls":[{"id":"name","kind":"text"},{"id":"save","kind":"click"}]}}}"""))
        assertTrue(page.keepsEditing("name"));assertTrue(page.keepsEditing("scroll:list"));assertFalse(page.keepsEditing("save"))
    }
}
