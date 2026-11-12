package io.github.huleixin.tingyu.chrome

import android.content.Context
import android.graphics.*
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.BitmapDrawable
import androidx.test.core.app.ApplicationProvider
import io.github.huleixin.tingyu.R
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

// Render packaged Android resources with Android's Canvas, including actual adaptive and themed icons.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class BrandIconRenderTest {
    private val context=ApplicationProvider.getApplicationContext<Context>()
    private fun save(bitmap:Bitmap,name:String){val f=File("build/reports/brand-icons/$name.png");f.parentFile!!.mkdirs();f.outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)}}
    // Robolectric native Canvas starts at API 26; API 24 verifies actual bitmap selection/decoding.
    @Test @Config(sdk=[24]) @GraphicsMode(GraphicsMode.Mode.LEGACY) fun legacyIcons(){
        for(id in listOf(R.mipmap.ic_launcher,R.mipmap.ic_launcher_round)){
            val bitmap=(context.getDrawable(id) as BitmapDrawable).bitmap
            assertEquals(255,Color.alpha(bitmap.getPixel(bitmap.width/2,bitmap.height/2)))
            save(bitmap,if(id==R.mipmap.ic_launcher)"legacy" else "legacy-round")
        }
    }
    @Test @Config(sdk=[26,33]) fun standaloneBrandHasRoundedCornersAndFullArtwork(){
        val icon=context.getDrawable(R.drawable.ic_brand_logo)!!
        val bitmap=Bitmap.createBitmap(120,120,Bitmap.Config.ARGB_8888)
        icon.setBounds(0,0,120,120);icon.draw(Canvas(bitmap))
        for((x,y) in listOf(0 to 0,119 to 0,0 to 119,119 to 119))
            assertEquals("Corners must stay transparent",0,Color.alpha(bitmap.getPixel(x,y)))
        assertEquals(255,Color.alpha(bitmap.getPixel(60,5)))
        assertTrue("Gradient top must retain the original ice color",Color.red(bitmap.getPixel(60,5))>170)
        assertTrue("Original wave must reach the left edge",Color.red(bitmap.getPixel(2,82))>240)
        save(bitmap,"standalone-brand")
    }
    @Test @Config(sdk=[31,33]) fun nativeStartingIconUsesCompleteRoundedBrand(){
        val theme=context.resources.newTheme().apply{applyStyle(R.style.AppTheme_NoActionBarLaunch,true)}
        val value=android.util.TypedValue()
        assertTrue(theme.resolveAttribute(android.R.attr.windowSplashScreenAnimatedIcon,value,true))
        assertEquals(R.drawable.brand_splash_logo,value.resourceId)
        val icon=context.getDrawable(value.resourceId)!!
        val bitmap=Bitmap.createBitmap(288,288,Bitmap.Config.ARGB_8888)
        icon.setBounds(0,0,288,288);icon.draw(Canvas(bitmap))
        var opaque=0
        for(y in 0 until 288)for(x in 0 until 288){
            if(Color.alpha(bitmap.getPixel(x,y))>0){
                opaque++
                assertTrue("Artwork must stay inside the system safe circle",(x-144)*(x-144)+(y-144)*(y-144)<=96*96)
            }
        }
        assertTrue("Brand must be visible from the system starting window",opaque>10000)
        assertEquals(0,Color.alpha(bitmap.getPixel(88,88)))
        assertEquals(255,Color.alpha(bitmap.getPixel(144,92)))
        save(bitmap,"system-starting-brand")
    }
    @Test @Config(sdk=[33]) fun adaptiveLayersAndMasks(){
        val icon=context.getDrawable(R.mipmap.ic_launcher) as AdaptiveIconDrawable
        val actual=Bitmap.createBitmap(256,256,Bitmap.Config.ARGB_8888)
        icon.setBounds(0,0,256,256);icon.draw(Canvas(actual));save(actual,"android-adaptive")
        assertNotNull(icon.monochrome)
        for(mask in listOf("circle","rounded","square")){
            val bitmap=Bitmap.createBitmap(256,256,Bitmap.Config.ARGB_8888);val canvas=Canvas(bitmap)
            val path=Path().apply{when(mask){"circle"->addCircle(128f,128f,128f,Path.Direction.CW);"rounded"->addRoundRect(0f,0f,256f,256f,58f,58f,Path.Direction.CW);else->addRect(0f,0f,256f,256f,Path.Direction.CW)}}
            canvas.clipPath(path)
            // AdaptiveIconDrawable expands each layer 1.5x behind its launcher mask.
            for(layer in listOf(icon.background,icon.foreground)){layer.setBounds(-64,-64,320,320);layer.draw(canvas)}
            assertEquals(255,Color.alpha(bitmap.getPixel(128,128)))
            val pixels=IntArray(256*256);bitmap.getPixels(pixels,0,256,0,0,256,256)
            assertTrue("Primary wave must remain visible",pixels.count{Color.red(it)>245&&Color.green(it)>245&&Color.blue(it)>245&&Color.alpha(it)>240}>1000)
            save(bitmap,"mask-$mask")
        }
        val mono=Bitmap.createBitmap(256,256,Bitmap.Config.ARGB_8888);val canvas=Canvas(mono);canvas.drawColor(Color.rgb(32,46,64))
        icon.monochrome!!.setBounds(-64,-64,320,320);icon.monochrome!!.draw(canvas);save(mono,"monochrome")
    }
}
