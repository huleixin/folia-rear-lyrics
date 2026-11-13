package io.github.huleixin.tingyu;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import static org.junit.Assert.*;

// Even a previously drawn frame must disappear when the display ownership gate closes.
@RunWith(RobolectricTestRunner.class)
@Config(sdk=34)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class RearFrameIsolationTest {
    @Test public void wrongDisplayDrawsNeitherBackgroundNorOldChildren() {
        boolean[] allowed={true};
        RearInteractionFrame frame=new RearInteractionFrame(RuntimeEnvironment.getApplication(),new RearInteractionFrame.Actions(){
            public boolean canInteract(){return false;}
            public boolean canDraw(){return allowed[0];}
            public void exit(){}
        });
        frame.setBackgroundColor(Color.RED);frame.layout(0,0,40,40);
        Bitmap image=Bitmap.createBitmap(40,40,Bitmap.Config.ARGB_8888);
        frame.draw(new Canvas(image));assertEquals(Color.RED,image.getPixel(20,20));
        allowed[0]=false;image.eraseColor(Color.TRANSPARENT);
        frame.draw(new Canvas(image));assertEquals(Color.TRANSPARENT,image.getPixel(20,20));
        image.recycle();
    }
}
