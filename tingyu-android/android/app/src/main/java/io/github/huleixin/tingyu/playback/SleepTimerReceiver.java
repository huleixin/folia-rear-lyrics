package io.github.huleixin.tingyu.playback;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
// android/app/src/main/java/io/github/huleixin/tingyu/playback/SleepTimerReceiver.java
/** Inexact deep-sleep backup. A new process retires the old task instead of starting audio. */
public final class SleepTimerReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context context,Intent intent){SleepTimerController.get(context).alarm(intent.getLongExtra("generation",-1));}
}
