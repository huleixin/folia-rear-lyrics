package io.github.huleixin.tingyu.playback;

import android.app.job.JobParameters;
import android.app.job.JobService;
import java.util.concurrent.atomic.AtomicBoolean;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/ResourceCacheJobService.java
public final class ResourceCacheJobService extends JobService {
    private AtomicBoolean stopped;
    @Override public boolean onStartJob(JobParameters params) {
        AtomicBoolean cancellation = new AtomicBoolean(); stopped = cancellation;
        PlaylistResourceCache cache = PlaylistResourceCache.get(this);
        cache.bulk.execute(() -> {
            cache.jobNote("running","");
            boolean remaining = true;
            try { remaining = cache.drain(cancellation::get); }
            catch (Exception error) { cache.jobNote("exception",error.getClass().getSimpleName()); }
            if (!cancellation.get()) {
                cache.jobNote("idle","");
                // Normal bounded batches are successful work, not failures to exponentially back off.
                jobFinished(params, false);
                if(remaining)new android.os.Handler(android.os.Looper.getMainLooper()).post(()->{
                    android.app.job.JobScheduler js=(android.app.job.JobScheduler)getSystemService(JOB_SCHEDULER_SERVICE);
                    if(js!=null)js.cancel(params.getJobId());
                    cache.scheduleNext();
                });
            }
        });
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) {
        if (stopped != null) stopped.set(true);
        PlaylistResourceCache.get(this).jobNote("system-stopped",android.os.Build.VERSION.SDK_INT>=31?String.valueOf(params.getStopReason()):"system");
        return true;
    }
}
