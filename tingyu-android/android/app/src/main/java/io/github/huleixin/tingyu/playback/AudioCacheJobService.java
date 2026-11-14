package io.github.huleixin.tingyu.playback;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.atomic.AtomicBoolean;

// Bounded batches yield to JobScheduler. Stopping a job cancels the current network call.
public final class AudioCacheJobService extends JobService {
    private volatile AtomicBoolean stopped;
    @Override public boolean onStartJob(JobParameters params){
        AtomicBoolean cancel=new AtomicBoolean();stopped=cancel;
        AudioCacheJobs.dispatch(this,jobs->{
            if(cancel.get())return;
            jobs.activeJobs.incrementAndGet();
            jobs.bulk.execute(()->{
                try {if(!cancel.get())jobs.drain(cancel::get);}
                finally {
                    jobs.activeJobs.decrementAndGet();
                    new Handler(Looper.getMainLooper()).post(()->{
                        if(cancel.get()||stopped!=cancel)return;
                        jobFinished(params,false);
                        // A page may have arrived while the last download was finishing.
                        jobs.io.execute(jobs::schedule);
                    });
                }
            });
        },error->new Handler(Looper.getMainLooper()).post(()->{if(!cancel.get()&&stopped==cancel)jobFinished(params,true);}));
        return true;
    }
    @Override public boolean onStopJob(JobParameters params){
        if(stopped!=null)stopped.set(true);
        AudioCacheJobs jobs=AudioCacheJobs.peek();if(jobs!=null)jobs.stop();return true;
    }
}
