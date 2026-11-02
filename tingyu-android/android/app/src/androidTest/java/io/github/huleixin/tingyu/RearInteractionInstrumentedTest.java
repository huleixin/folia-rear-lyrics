package io.github.huleixin.tingyu;

import android.content.Context;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

// android/app/src/androidTest/java/io/github/huleixin/tingyu/RearInteractionInstrumentedTest.java
// View cancellation / provider access only. This does not simulate a Xiaomi MAML host or AOD.
@RunWith(AndroidJUnit4.class)
public class RearInteractionInstrumentedTest {
    @Test public void upwardDragCancelsTheChildAndExitsOnlyOnce(){
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();float d=context.getResources().getDisplayMetrics().density;
            int[] exit={0},up={0},cancel={0};
            RearInteractionFrame root=new RearInteractionFrame(context,new RearInteractionFrame.Actions(){public boolean canInteract(){return true;}public void exit(){exit[0]++;}});
            View child=new View(context);child.setOnTouchListener((v,e)->{if(e.getActionMasked()==MotionEvent.ACTION_UP)up[0]++;if(e.getActionMasked()==MotionEvent.ACTION_CANCEL)cancel[0]++;return true;});
            root.addView(child,new FrameLayout.LayoutParams(-1,-1));int w=(int)(320*d),h=(int)(220*d);
            root.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(h,View.MeasureSpec.EXACTLY));root.layout(0,0,w,h);
            long start=SystemClock.uptimeMillis();
            for(int round=0;round<2;round++){
                send(root,start+round*500,0,150*d,180*d);send(root,start+round*500,100,150*d,100*d);send(root,start+round*500,200,150*d,50*d);
            }
            assertEquals(1,exit[0]);assertEquals(0,up[0]);assertEquals(1,cancel[0]);
        });
    }
    private static void send(View view,long start,long delta,float x,float y){
        int action=delta==0?MotionEvent.ACTION_DOWN:delta==200?MotionEvent.ACTION_UP:MotionEvent.ACTION_MOVE;
        MotionEvent event=MotionEvent.obtain(start,start+delta,action,x,y,0);view.dispatchTouchEvent(event);event.recycle();
    }
    @Test public void normalAppsCannotReadOrRegisterAsThePrivilegedHost(){
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        try{context.getContentResolver().call(android.net.Uri.parse("content://"+RearHostContract.AUTHORITY),"register",null,new android.os.Bundle());fail("Host UID check missing");}
        catch(SecurityException expected){}
    }
}
