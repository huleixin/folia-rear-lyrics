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
            boolean remaining = true;
            try { remaining = cache.drain(cancellation::get); }
            catch (Exception ignored) { }
            if (!cancellation.get()) jobFinished(params, remaining);
        });
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) {
        if (stopped != null) stopped.set(true);
        return true;
    }
}
