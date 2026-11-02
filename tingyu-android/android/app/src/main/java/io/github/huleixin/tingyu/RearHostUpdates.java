package io.github.huleixin.tingyu;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostUpdates.java
/** Coalesced semantic events, not a second clock or a playback poll. Inert without a host lease. */
final class RearHostUpdates {
    private static volatile Runnable signal;
    static void bind(Context context){
        Context app=context.getApplicationContext();Handler main=new Handler(Looper.getMainLooper());
        Runnable notify=()->{if(RearHostBridge.hasSession())app.getContentResolver().notifyChange(Uri.parse("content://"+RearHostContract.AUTHORITY+"/state"),null);};
        signal=()->{if(RearHostBridge.hasSession()){main.removeCallbacks(notify);main.postDelayed(notify,50);}};
    }
    static void changed(){Runnable current=signal;if(current!=null)current.run();}
}
