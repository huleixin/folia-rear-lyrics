package io.github.huleixin.tingyu;

import android.content.Context;
import android.view.MotionEvent;
import android.widget.FrameLayout;

// android/app/src/main/java/io/github/huleixin/tingyu/RearInteractionFrame.java
/** Both backends host this view. Intercepting a drag sends CANCEL to the child WebView. */
final class RearInteractionFrame extends FrameLayout {
    interface Actions { boolean canInteract(); void exit(); }
    private final RearSwipeGesture gesture=new RearSwipeGesture();
    private final Actions actions;
    private boolean intercepting,exited;
    RearInteractionFrame(Context context, Actions actions) { super(context); this.actions=actions; }
    private float dp(float value) { return value/getResources().getDisplayMetrics().density; }
    @Override public boolean onInterceptTouchEvent(MotionEvent event) {
        if(exited)return true;
        if (!actions.canInteract()) { gesture.cancel(); return false; }
        int action=event.getActionMasked();
        if (action==MotionEvent.ACTION_DOWN) {
            intercepting=false;
            gesture.down(dp(event.getX()),dp(event.getY()),event.getEventTime(),dp(getWidth()),dp(getHeight()));
        } else if (event.getPointerCount()>1 || action==MotionEvent.ACTION_CANCEL) gesture.cancel();
        else if (action==MotionEvent.ACTION_MOVE && gesture.move(dp(event.getX()),dp(event.getY()))) {
            intercepting=true;
            return true;
        } else if (action==MotionEvent.ACTION_UP) gesture.cancel();
        return false;
    }
    @Override public boolean onTouchEvent(MotionEvent event) {
        if(exited)return true;
        if (!intercepting) return super.onTouchEvent(event);
        int action=event.getActionMasked();
        if (!actions.canInteract() || event.getPointerCount()>1 || action==MotionEvent.ACTION_CANCEL) gesture.cancel();
        else if (action==MotionEvent.ACTION_MOVE) gesture.move(dp(event.getX()),dp(event.getY()));
        else if (action==MotionEvent.ACTION_UP && gesture.up(dp(event.getX()),dp(event.getY()),event.getEventTime())) {exited=true;actions.exit();}
        if (action==MotionEvent.ACTION_UP || action==MotionEvent.ACTION_CANCEL) intercepting=false;
        return true;
    }
}
