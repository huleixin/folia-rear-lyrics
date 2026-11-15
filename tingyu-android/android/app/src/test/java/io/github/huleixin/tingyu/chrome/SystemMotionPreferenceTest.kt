package io.github.huleixin.tingyu.chrome

import android.os.Looper
import android.provider.Settings
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/SystemMotionPreferenceTest.kt
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.LEGACY)
class SystemMotionPreferenceTest {
    @Test fun observesSystemChangesAndUnregistersOnClose() {
        val resolver = RuntimeEnvironment.getApplication().contentResolver
        Settings.Global.putFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        assertFalse(SystemMotionPreference.read(resolver))
        val values = mutableListOf<Boolean>()
        val observer = SystemMotionPreference(resolver) { values.add(it) }
        Settings.Global.putFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 0f)
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue(SystemMotionPreference.read(resolver))
        assertEquals(listOf(true), values)
        Settings.Global.putFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 0.5f)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(listOf(true, false), values)
        observer.close()
        Settings.Global.putFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 0f)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(listOf(true, false), values)
    }
}
