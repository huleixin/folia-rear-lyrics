package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearSwipeGesture.java
/** Single-pointer intent gate. Coordinates are dp, time is MotionEvent's monotonic uptime. */
final class RearSwipeGesture {
    private float x, y, distance;
    private long downAt;
    private boolean tracking, dragging, fired;
    void down(float x, float y, long time, float width, float height) {
        cancel();
        if (fired || width <= 0 || height <= 0 || x < 12 || x > width - 12 || y < 8 || y > height - 12) return;
        this.x=x; this.y=y; downAt=time;
        distance=Math.max(40, Math.min(80, height * .20f));
        tracking=true;
    }
    boolean move(float x, float y) {
        if (!tracking) return false;
        float dx=x-this.x, up=this.y-y;
        if (Math.abs(dx)>12 && Math.abs(dx)>Math.abs(up)) { cancel(); return false; }
        if (up>10 && up>Math.abs(dx)*1.5f) dragging=true;
        return dragging;
    }
    boolean up(float x, float y, long time) {
        move(x,y);
        float up=this.y-y;
        long elapsed=time-downAt;
        boolean exit=tracking && !fired && dragging && elapsed>0 && elapsed<=1500
            && up>=distance && up>Math.abs(x-this.x)*1.5f
            && (up*1000/elapsed>=160 || up>=distance*1.6f);
        cancel();
        if (exit) fired=true;
        return exit;
    }
    void cancel() { tracking=false; dragging=false; }
}
