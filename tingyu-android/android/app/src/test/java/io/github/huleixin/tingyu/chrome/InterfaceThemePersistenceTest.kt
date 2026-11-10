package io.github.huleixin.tingyu.chrome

import android.content.Context
import android.content.res.Configuration
import androidx.test.core.app.ApplicationProvider
import io.github.huleixin.tingyu.R
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// Native startup mirror migration: a style selection cannot replace the user's display mode.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class InterfaceThemePersistenceTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val prefs get() = context.getSharedPreferences("tingyu_interface_appearance_v1",0)
    @Before fun reset() { prefs.edit().clear().commit() }
    @Test fun oldModeMigratesToClassicWithoutReset() {
        for(mode in listOf("light","dark","system")) {
            prefs.edit().clear().putString("mode",mode).commit()
            assertEquals(mode,InterfaceAppearance.mode(context))
            assertEquals("classic",InterfaceAppearance.style(context))
        }
    }
    @Test fun styleAndModeSurviveNewContextAndResolveBothSystemConfigurations() {
        for(style in listOf("classic","glacier"))for(mode in listOf("light","dark","system")) {
            InterfaceAppearance.save(context,mode,style)
            for(light in listOf(false,true)) {
                val config=Configuration(context.resources.configuration)
                config.uiMode=if(light)Configuration.UI_MODE_NIGHT_NO else Configuration.UI_MODE_NIGHT_YES
                val restored=context.createConfigurationContext(config)
                assertEquals(style,InterfaceAppearance.style(restored));assertEquals(mode,InterfaceAppearance.mode(restored))
                assertEquals(mode=="light" || mode=="system"&&light,InterfaceAppearance.light(restored))
                assertEquals(InterfaceThemes.launchTheme(style,mode),InterfaceAppearance.launchTheme(restored))
            }
        }
    }
    @Test fun invalidAndCorruptPreferencesUseClassicDark() {
        prefs.edit().putString("mode","bad").putString("style","bad").commit()
        assertEquals(R.style.InterfaceLaunch_classic_Dark,InterfaceAppearance.launchTheme(context))
        prefs.edit().putBoolean("mode",true).putInt("style",3).commit()
        assertEquals("classic",InterfaceAppearance.style(context));assertEquals("dark",InterfaceAppearance.mode(context))
    }
}
