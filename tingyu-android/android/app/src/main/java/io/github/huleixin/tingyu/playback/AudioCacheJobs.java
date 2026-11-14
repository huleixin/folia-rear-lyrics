package io.github.huleixin.tingyu.playback;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.json.JSONArray;
import org.json.JSONObject;
import io.github.huleixin.tingyu.LocalAudioServer;
import io.github.huleixin.tingyu.resolver.ResolverRegistry;
import io.github.huleixin.tingyu.resolver.SourceResolution;

// Durable, deduplicated, bounded playlist tasks. No signed URLs or credentials are persisted.
public final class AudioCacheJobs {
    private static volatile AudioCacheJobs instance;private static final int JOB=84021;
    public static synchronized AudioCacheJobs get(Context c){if(instance==null)instance=new AudioCacheJobs(c.getApplicationContext());return instance;}
    private static final ExecutorService INIT_IO=Executors.newSingleThreadExecutor(r->new Thread(r,"tingyu-cache-init"));
    public static AudioCacheJobs peek(){return instance;}
    /** Opening the task database never runs on the UI thread. */
    public static void dispatch(Context c,java.util.function.Consumer<AudioCacheJobs> work){dispatch(c,work,error->{});}
    public static void dispatch(Context c,java.util.function.Consumer<AudioCacheJobs> work,java.util.function.Consumer<Exception> failed){Context app=c.getApplicationContext();INIT_IO.execute(()->{try{AudioCacheJobs jobs=get(app);jobs.io.execute(()->{try{work.accept(jobs);}catch(Exception e){failed.accept(e);}});}catch(Exception e){failed.accept(e);}});}
    final ExecutorService io=Executors.newSingleThreadExecutor(r->new Thread(r,"tingyu-audio-jobs"));
    final ExecutorService bulk=Executors.newSingleThreadExecutor(r->new Thread(r,"tingyu-audio-download"));
    final java.util.concurrent.atomic.AtomicInteger activeJobs=new java.util.concurrent.atomic.AtomicInteger();private volatile okhttp3.Call activeCall;private long lastReconcile;
    final Context context;final SQLiteDatabase db;final AudioCacheStore cache;
    private AudioCacheJobs(Context c){context=c;cache=AudioCacheStore.get(c);db=c.openOrCreateDatabase("audio-cache-jobs.db",0,null);db.execSQL("CREATE TABLE IF NOT EXISTS jobs (key TEXT PRIMARY KEY, collection TEXT, title TEXT, payload TEXT, quality TEXT, state TEXT, attempts INTEGER DEFAULT 0, bytes INTEGER DEFAULT 0, reason TEXT DEFAULT '', updated INTEGER)");db.execSQL("UPDATE jobs SET state='pending' WHERE state='running'");db.execSQL("CREATE TABLE IF NOT EXISTS catalogs (id TEXT PRIMARY KEY, descriptor TEXT, quality TEXT, offset INTEGER DEFAULT 0, done INTEGER DEFAULT 0, failed INTEGER DEFAULT 0)");}
    public synchronized void sourceChanged(String route){
        if(!route.matches("[a-f0-9]{64}")||route.equals(cache.route()))return;
        stop();cache.changeRoute(route);
        db.execSQL("UPDATE jobs SET state='stale',reason='音源设置已变化，请重新缓存歌单' WHERE state IN ('pending','running','failed')");
        db.execSQL("UPDATE catalogs SET done=1");
    }
    public boolean networkAllowed(){ConnectivityManager cm=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);if(cm==null)return false;NetworkCapabilities n=cm.getNetworkCapabilities(cm.getActiveNetwork());return n!=null&&n.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)&&(!cache.wifiOnly()||(n.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)&&!cm.isActiveNetworkMetered()))&&cm.getRestrictBackgroundStatus()!=ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED;}
    public synchronized void enqueue(JSONArray tracks,String collection,String quality)throws Exception{if(!cache.enabled()||tracks==null)return;long now=System.currentTimeMillis();db.beginTransaction();try{
        db.execSQL("UPDATE jobs SET state='failed',reason='请手动重试' WHERE state='pending' AND attempts>=3");
        int count=0;try(Cursor c=db.rawQuery("SELECT count(*) FROM jobs",null)){if(c.moveToFirst())count=c.getInt(0);}
        for(int i=0;i<tracks.length()&&i<50;i++){JSONObject raw=tracks.optJSONObject(i);NativePlaylist.Track track=TingyuPlaybackPlugin.trackOf(raw);if(track==null||track.providerId.isEmpty()||!cache.routeMatches(track))continue;String key=AudioCacheStore.key(track,quality);if(key.isEmpty())continue;
            // Keep only catalog metadata needed for strict matching / resolution.
            boolean exists;try(Cursor row=db.rawQuery("SELECT key FROM jobs WHERE key=?",new String[]{key})){exists=row.moveToFirst();}
            if(!exists&&count>=10000)throw new IllegalStateException("audio task limit");
            db.execSQL("INSERT OR IGNORE INTO jobs(key,collection,title,payload,quality,state,updated) VALUES(?,?,?,?,?,?,?)",new Object[]{key,collection,track.title,AudioCachePayload.sanitize(raw).toString(),quality,cache.lookup(key)==null?"pending":"complete",now});db.execSQL("UPDATE jobs SET state='pending',attempts=0,reason='' WHERE key=? AND state IN ('evicted','cancelled')",new Object[]{key});if(!exists)count++;
        }db.setTransactionSuccessful();}finally{db.endTransaction();}schedule();}
    /** Catalog offset is committed only after its songs; re-reading a page is idempotent. */
    public synchronized void catalog(JSONObject data)throws Exception {
        String id=data.optString("collection","");if(id.isEmpty()||id.length()>500||!cache.enabled()||!cache.route().equals(data.optString("cacheRoute")))return;
        JSONObject raw=data.optJSONObject("descriptor");
        if(raw!=null){
            if(!"online".equals(raw.optString("source"))||!"playlist".equals(raw.optString("type")))return;
            JSONObject safe=new JSONObject();for(String k:new String[]{"source","providerId","type","id","name","trackCount"})if(raw.has(k))safe.put(k,String.valueOf(raw.opt(k)).substring(0,Math.min(500,String.valueOf(raw.opt(k)).length())));
            db.execSQL("DELETE FROM catalogs WHERE done=1 AND id<>? AND (SELECT count(*) FROM catalogs)>=20",new Object[]{id});
            boolean exists;try(Cursor row=db.rawQuery("SELECT id FROM catalogs WHERE id=?",new String[]{id})){exists=row.moveToFirst();}
            try(Cursor c=db.rawQuery("SELECT count(*) FROM catalogs WHERE done=0",null)){if(!exists&&c.moveToFirst()&&c.getInt(0)>=20)throw new IllegalStateException("catalog limit");}
            db.execSQL("INSERT OR IGNORE INTO catalogs(id,descriptor,quality) VALUES(?,?,?)",new Object[]{id,safe.toString(),data.optString("quality","standard")});
        }
        try(Cursor c=db.rawQuery("SELECT done,failed FROM catalogs WHERE id=?",new String[]{id})){if(!c.moveToFirst()||c.getInt(0)!=0||c.getInt(1)!=0)return;}
        if(data.has("tracks")){
            enqueue(data.optJSONArray("tracks"),id,data.optString("quality","standard"));
            db.execSQL("UPDATE catalogs SET offset=MAX(offset,?),done=? WHERE id=?",new Object[]{Math.max(0,Math.min(10000,data.optInt("offset"))),data.optBoolean("done")?1:0,id});
        }
        if(data.optBoolean("failed"))db.execSQL("UPDATE catalogs SET failed=1 WHERE id=?",new Object[]{id});
    }
    public void stop(){okhttp3.Call call=activeCall;if(call!=null)call.cancel();}
    public synchronized void action(String action){if("cancel".equals(action)||"clear".equals(action)||!cache.enabled())stop();if("retry".equals(action))db.execSQL("UPDATE catalogs SET failed=0 WHERE done=0");if("retry".equals(action))db.execSQL("UPDATE jobs SET state='pending',attempts=0,reason='' WHERE state='failed'");if("cancel".equals(action))db.execSQL("UPDATE catalogs SET done=1");if("cancel".equals(action))db.execSQL("UPDATE jobs SET state='cancelled' WHERE state IN ('pending','running')");if("clear".equals(action)){db.execSQL("DELETE FROM jobs");db.execSQL("DELETE FROM catalogs");cache.clear();}schedule();}
    public void schedule(){if(!cache.enabled()||activeJobs.get()>0)return;try(Cursor c=db.rawQuery("SELECT count(*) FROM jobs WHERE state='pending' AND attempts<3",null)){if(!c.moveToFirst()||c.getInt(0)==0)return;}JobScheduler js=(JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE);if(js==null)return;
        js.schedule(new JobInfo.Builder(JOB,new ComponentName(context,AudioCacheJobService.class)).setRequiredNetworkType(cache.wifiOnly()?JobInfo.NETWORK_TYPE_UNMETERED:JobInfo.NETWORK_TYPE_ANY).setPersisted(true).setMinimumLatency(networkAllowed()?15000:60000).build());}
    private synchronized boolean running(String key){try(Cursor c=db.rawQuery("SELECT state FROM jobs WHERE key=?",new String[]{key})){return c.moveToFirst()&&"running".equals(c.getString(0));}}
    public boolean drain(BooleanSupplier cancelled){for(int i=0;i<5;i++){
        if(cancelled.getAsBoolean()||!cache.enabled()||!networkAllowed())return true;
        String key,payload,quality;try(Cursor c=db.rawQuery("SELECT key,payload,quality FROM jobs WHERE state='pending' AND attempts<3 ORDER BY updated LIMIT 1",null)){if(!c.moveToFirst())return false;key=c.getString(0);payload=c.getString(1);quality=c.getString(2);}
        db.execSQL("UPDATE jobs SET state='running',attempts=attempts+1 WHERE key=? AND state='pending'",new Object[]{key});
        if(!running(key))continue;
        long bytes=0;String state="failed",reason="无法获取完整音频";
        okhttp3.Call call=null;
        try {
            if(cache.lookup(key)!=null){state="complete";reason="";}else {
                NativePlaylist.Track track=TingyuPlaybackPlugin.trackOf(new JSONObject(payload));
                if(!cache.routeMatches(track))throw new InterruptedException();
                SourceResolution source=ResolverRegistry.get().resolve(track,quality);if(!source.ok())throw new IllegalStateException("source unavailable");
                if(cancelled.getAsBoolean()||!running(key)||!cache.routeMatches(track)||!networkAllowed())throw new InterruptedException();
                cache.bind(source.url,key,source.backupProviderId.isEmpty()?track.providerId:source.backupProviderId,track.durationMs,source.quality);
                String url=LocalAudioServer.shared(context).registerResolvedAudio(source.url,false,source.headers);
                cache.alias(source.url,url);
                call=new okhttp3.OkHttpClient.Builder().connectTimeout(8,TimeUnit.SECONDS).readTimeout(15,TimeUnit.SECONDS).callTimeout(180,TimeUnit.SECONDS).build().newCall(new okhttp3.Request.Builder().url(url).build());
                activeCall=call;
                try(okhttp3.Response response=call.execute()){
                    if(!response.isSuccessful()||response.body()==null)throw new java.io.IOException("download failed");
                    try(java.io.InputStream input=response.body().byteStream()){byte[] b=new byte[65536];int n;long next=0;while((n=input.read(b))!=-1){bytes+=n;if(bytes>AudioCacheStore.MAX_FILE)throw new java.io.IOException("file limit");if(cancelled.getAsBoolean()||!running(key)||!cache.enabled()||!networkAllowed())throw new InterruptedException();if(bytes>=next){db.execSQL("UPDATE jobs SET bytes=? WHERE key=? AND state='running'",new Object[]{bytes,key});next=bytes+1024*1024;}Thread.sleep(100);}}
                }
                cache.awaitWrites();if(cache.lookup(key)==null)throw new java.io.IOException("incomplete or unsupported media");state="complete";reason="";
            }
        }catch(InterruptedException e){state="pending";reason="等待网络或继续缓存";}catch(Exception e){if(cancelled.getAsBoolean()||!cache.enabled()||!networkAllowed()){state="pending";reason="等待网络或继续缓存";}else reason="未能取得完整且匹配的音频，可重试或更换音源";}
        finally{if(call!=null)call.cancel();activeCall=null;if("pending".equals(state))db.execSQL("UPDATE jobs SET attempts=MAX(0,attempts-1) WHERE key=? AND state='running'",new Object[]{key});db.execSQL("UPDATE jobs SET state=?,bytes=?,reason=?,updated=? WHERE key=? AND state='running'",new Object[]{state,bytes,reason,System.currentTimeMillis(),key});}
    }return true;}
    public synchronized JSONObject status()throws Exception{
        if(System.currentTimeMillis()-lastReconcile>=60000){lastReconcile=System.currentTimeMillis();try(Cursor c=db.rawQuery("SELECT key FROM jobs WHERE state='complete'",null)){while(c.moveToNext()){String key=c.getString(0);if(!cache.hasFiles(key))db.execSQL("UPDATE jobs SET state='evicted',reason='' WHERE key=?",new Object[]{key});}}}
        JSONObject result=cache.status();for(String state:new String[]{"pending","running","complete","failed","cancelled","evicted","stale"})try(Cursor c=db.rawQuery("SELECT count(*) FROM jobs WHERE state=?",new String[]{state})){result.put(state,c.moveToFirst()?c.getInt(0):0);}result.put("networkAllowed",networkAllowed());JSONArray rows=new JSONArray();try(Cursor c=db.rawQuery("SELECT title,state,bytes,reason FROM jobs ORDER BY CASE state WHEN 'failed' THEN 0 WHEN 'running' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,updated DESC LIMIT 30",null)){while(c.moveToNext())rows.put(new JSONObject().put("title",c.getString(0)).put("state",c.getString(1)).put("bytes",c.getLong(2)).put("reason",c.getString(3)));}JSONArray catalogs=new JSONArray();int incomplete=0;try(Cursor c=db.rawQuery("SELECT id,descriptor,quality,offset,failed FROM catalogs WHERE done=0 LIMIT 20",null)){while(c.moveToNext()){incomplete++;if(c.getInt(4)==0)catalogs.put(new JSONObject().put("id",c.getString(0)).put("descriptor",new JSONObject(c.getString(1))).put("quality",c.getString(2)).put("offset",c.getInt(3)).put("cacheRoute",cache.route()));}}try(Cursor c=db.rawQuery("SELECT count(*) FROM jobs",null)){result.put("taskLimitReached",c.moveToFirst()&&c.getInt(0)>=10000);}return result.put("tasks",rows).put("catalogs",catalogs).put("incompleteCatalogs",incomplete);}
}
