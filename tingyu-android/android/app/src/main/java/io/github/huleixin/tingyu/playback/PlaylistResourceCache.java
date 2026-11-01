package io.github.huleixin.tingyu.playback;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.BooleanSupplier;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/PlaylistResourceCache.java
/** Durable resource manifest; never owns audio, playback clocks, or a second lyric authority. */
public final class PlaylistResourceCache extends SQLiteOpenHelper {
    private static final int JOB_ID = 27069;
    private static volatile PlaylistResourceCache instance;
    public static synchronized PlaylistResourceCache get(Context context) {
        if (instance == null) instance = new PlaylistResourceCache(context.getApplicationContext());
        return instance;
    }
    private volatile boolean pausedByClear;
    private long lastAudit,lastQualityAt;
    private int qualityConfirmed,qualityProvisional,qualityNone;
    private final java.util.concurrent.atomic.AtomicBoolean draining=new java.util.concurrent.atomic.AtomicBoolean();
    private final Context context;
    private final android.content.SharedPreferences preferences;
    final ExecutorService bulk = Executors.newSingleThreadExecutor(r -> new Thread(r, "resource-bulk"));
    final ExecutorService io = Executors.newSingleThreadExecutor(r -> new Thread(r, "resource-manifest"));
    private PlaylistResourceCache(Context context) {
        super(context, "song-resources.db", null, 2);
        this.context = context;
        preferences = context.getSharedPreferences("resource-cache-policy", 0);
        setWriteAheadLoggingEnabled(true);
        pausedByClear=preferences.getBoolean("paused",false);
        ConnectivityManager cm=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if(cm!=null)try{cm.registerDefaultNetworkCallback(new ConnectivityManager.NetworkCallback(){
            @Override public void onCapabilitiesChanged(android.net.Network network,NetworkCapabilities capabilities){
                io.execute(()->{if(networkAllowed())scheduleNext();});
            }
        });}catch(Exception error){jobNote("network-watch-unavailable",error.getClass().getSimpleName());}
    }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE manifest(id INTEGER PRIMARY KEY CHECK(id=1), token TEXT, ready INTEGER, expected INTEGER DEFAULT 0, descriptor TEXT, catalogOffset INTEGER DEFAULT 0, catalogComplete INTEGER DEFAULT 0)");
        db.execSQL("CREATE TABLE tasks(song TEXT PRIMARY KEY, payload TEXT NOT NULL, ordinal INTEGER, priority INTEGER DEFAULT 2, state INTEGER DEFAULT 0, attempt INTEGER DEFAULT 0, due INTEGER DEFAULT 0, platformDone INTEGER DEFAULT 0, platformAttempt INTEGER DEFAULT 0, platformDue INTEGER DEFAULT 0, lyricState TEXT DEFAULT 'pending', artworkState TEXT DEFAULT 'pending')");
        db.execSQL("CREATE INDEX task_order ON tasks(state,due,priority,ordinal)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if(oldVersion<2){db.execSQL("ALTER TABLE tasks ADD COLUMN lyricState TEXT DEFAULT 'pending'");db.execSQL("ALTER TABLE tasks ADD COLUMN artworkState TEXT DEFAULT 'pending'");}
    }
    public synchronized void begin(String token) {
        pausedByClear = false;preferences.edit().putBoolean("paused",false).apply();
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("tasks", null, null);
            db.delete("manifest", null, null);
            ContentValues v = new ContentValues(); v.put("id", 1); v.put("token", token); v.put("ready", 0);
            db.insertOrThrow("manifest", null, v); db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }
    public String playlistId(){return token(false);}
    private String token(boolean requireReady) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT token,ready FROM manifest WHERE id=1", null)) {
            return c.moveToFirst() && (!requireReady || c.getInt(1) == 1) ? c.getString(0) : "";
        }
    }
    public synchronized void append(String token, JSONArray page, int offset, boolean finish) throws Exception {
        if (token.isEmpty() || !token.equals(token(false))) throw new IllegalArgumentException("stale snapshot");
        if (page.length() > ResourceCachePolicy.PAGE_SIZE) throw new IllegalArgumentException("page too large");
        SQLiteDatabase db = getWritableDatabase(); db.beginTransaction();
        try {
            for (int i = 0; i < page.length(); i++) {
                JSONObject raw = page.optJSONObject(i);
                if (raw == null || raw.optString("songKey").isEmpty()) continue;
                // Whitelist display metadata: never persist resolver cookies or an audio URL.
                JSONObject safe = new JSONObject();
                for (String field : new String[]{"songKey","providerId","mediaId","title","artist","album","artwork","durationMs"})
                    if (raw.has(field)) safe.put(field, raw.get(field));
                JSONObject rawData = raw.optJSONObject("providerData");
                if(rawData!=null) {
                    JSONObject ids=new JSONObject();
                    for(String field:new String[]{"songId","mediaMid","albumMid","albumId","hash"})
                        if(rawData.has(field) && (rawData.opt(field) instanceof String || rawData.opt(field) instanceof Number)) ids.put(field,rawData.get(field));
                    safe.put("providerData",ids);
                }
                ContentValues v = new ContentValues();
                v.put("song", safe.optString("songKey")); v.put("payload", safe.toString()); v.put("ordinal", offset+i);
                db.insertWithOnConflict("tasks", null, v, SQLiteDatabase.CONFLICT_IGNORE);
            }
            db.execSQL("UPDATE manifest SET catalogOffset=max(catalogOffset,?) WHERE id=1",new Object[]{offset+page.length()});
            if (finish) db.execSQL("UPDATE manifest SET ready=1 WHERE id=1");
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
        if (finish) schedule(1000);
    }
    public synchronized void catalogComplete(String token, boolean complete) {
        if(token.equals(token(false)))getWritableDatabase().execSQL("UPDATE manifest SET catalogComplete=? WHERE id=1",new Object[]{complete?1:0});
    }
    public synchronized void descriptor(String token, JSONObject descriptor) throws Exception {
        if (descriptor==null || !token.equals(token(false))) return;
        JSONObject safe=new JSONObject();
        for(String field:new String[]{"source","providerId","type","id","name","trackCount"})
            if(descriptor.has(field)) safe.put(field,descriptor.get(field));
        getWritableDatabase().execSQL("UPDATE manifest SET descriptor=? WHERE id=1",new Object[]{safe.toString()});
    }
    public synchronized void expected(String token, int total) {
        if (token.equals(token(false)) && total > 0) getWritableDatabase().execSQL("UPDATE manifest SET expected=? WHERE id=1", new Object[]{total});
    }
    public void prioritizeKey(String key) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT payload FROM tasks WHERE song=?", new String[]{key})) {
            if (c.moveToFirst()) reprioritize(SongInfo.fromTag(new JSONObject(c.getString(0)), 0));
        } catch (Exception ignored) { }
    }
    public void reprioritize(SongInfo current) {
        if (current == null) return;
        pausedByClear = false;preferences.edit().putBoolean("paused",false).apply();
        io.execute(() -> {
            List<SongInfo> protectedSongs = new ArrayList<>(); protectedSongs.add(current);
            SQLiteDatabase db = getWritableDatabase(); db.beginTransaction();
            try {
                db.execSQL("UPDATE tasks SET priority=2");
                db.execSQL("UPDATE tasks SET priority=0 WHERE song=?", new Object[]{current.songKey});
                for (int i = 1; i <= ResourceCachePolicy.AHEAD; i++) {
                    SongInfo next = SongInfo.fromTrack(NativePlaylist.get().lookahead(current.songKey, i), current.generation);
                    if (next == null || next.songKey.equals(current.songKey)) break;
                    protectedSongs.add(next);
                    db.execSQL("UPDATE tasks SET priority=1 WHERE song=?", new Object[]{next.songKey});
                }
                db.setTransactionSuccessful();
            } finally { db.endTransaction(); }
            NativeArtworkRepository.get(context).protect(protectedSongs);
            UnifiedLyricsStore.get(context).protect(protectedSongs);
            schedule(1000);
        });
    }
    public boolean networkAllowed() {
        if (pausedByClear || !preferences.getBoolean("enabled", true)) return false;
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        NetworkCapabilities nc = cm.getNetworkCapabilities(cm.getActiveNetwork());
        if (nc == null || !nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false;
        boolean metered = cm.isActiveNetworkMetered();
        return ResourceCachePolicy.allowBulkNetwork(true, preferences.getBoolean("wifiOnly",false),
            nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI), metered,
            cm.getRestrictBackgroundStatus() == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED);
    }
    public void configure(boolean enabled, boolean wifiOnly) {
        preferences.edit().putBoolean("enabled", enabled).putBoolean("wifiOnly", wifiOnly).apply();
        JobScheduler js = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js != null) js.cancel(JOB_ID);
        if (enabled) {pausedByClear=false;preferences.edit().putBoolean("paused",false).apply();scheduleNext();}
    }
    void schedule(long delay) {
        if (pausedByClear || !preferences.getBoolean("enabled", true) || token(true).isEmpty()) return;
        JobScheduler js = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) {jobNote("scheduler-unavailable","");return;}
        if(js.getPendingJob(JOB_ID)!=null)return;
        JobInfo.Builder builder = new JobInfo.Builder(JOB_ID, new ComponentName(context, ResourceCacheJobService.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setMinimumLatency(Math.max(1000, delay)).setPersisted(true)
            .setBackoffCriteria(30_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL);
        if(preferences.getBoolean("wifiOnly",false) && android.os.Build.VERSION.SDK_INT>=28)
            builder.setRequiredNetwork(new android.net.NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI).addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build());
        int result=js.schedule(builder.build());
        preferences.edit().putLong("nextRunAt",System.currentTimeMillis()+Math.max(1000,delay)).putString("jobState",result==JobScheduler.RESULT_SUCCESS?"scheduled":"schedule-rejected").apply();
    }
    public void jobNote(String state,String error){
        long now=System.currentTimeMillis();
        android.content.SharedPreferences.Editor edit=preferences.edit().putString("jobState",state);
        if("running".equals(state))edit.putLong("lastJobStart",now);
        else edit.putLong("lastJobEnd",now);
        if(!error.isEmpty())edit.putString("lastError",error);
        edit.apply();
        PlaybackDiagnostics.note("resource-job",new JSObject().put("state",state).put("reason",error));
    }
    void scheduleNext(){
        long due=nextDue();if(due>=0)schedule(Math.max(networkAllowed()?1000:15*60000L,ResourceCachePolicy.continuationDelay(due,System.currentTimeMillis())));
    }
    private long nextDue(){
        try(Cursor c=getReadableDatabase().rawQuery("SELECT min(due) FROM tasks WHERE state=0",null)){
            return c.moveToFirst()&&!c.isNull(0)?c.getLong(0):-1;
        }
    }
    public synchronized void resume(boolean retry){
        lastAudit=0;auditFiles();
        pausedByClear=false;preferences.edit().putBoolean("paused",false).apply();
        if(retry)getWritableDatabase().execSQL("UPDATE tasks SET state=0,attempt=0,due=0 WHERE state=2");
        if(retry)getWritableDatabase().execSQL("UPDATE tasks SET platformAttempt=0,platformDue=0 WHERE platformDone=0");
        scheduleNext();
    }
    /** One row at a time from SQLite. A job is bounded to 24 resources / 90s, then yields to Android. */
    boolean drain(BooleanSupplier cancelled) {
        if(!draining.compareAndSet(false,true))return true;
        try{return drainBatch(cancelled);}finally{draining.set(false);}
    }
    private boolean drainBatch(BooleanSupplier cancelled) {
        String runToken = token(true);
        long until = android.os.SystemClock.elapsedRealtime() + 90_000;
        int count = 0;
        while (!cancelled.getAsBoolean() && networkAllowed() && runToken.equals(token(true))
                && !runToken.isEmpty() && count++ < ResourceCachePolicy.BATCH_SIZE && android.os.SystemClock.elapsedRealtime() < until) {
            String key, payload; int attempt, priority;
            try (Cursor c = getReadableDatabase().rawQuery("SELECT song,payload,attempt,priority FROM tasks WHERE state=0 AND due<=? ORDER BY priority,ordinal LIMIT 1",
                    new String[]{String.valueOf(System.currentTimeMillis())})) {
                if (!c.moveToFirst()) break;
                key=c.getString(0); payload=c.getString(1); attempt=c.getInt(2); priority=c.getInt(3);
            }
            boolean lyricReady = false, artworkReady = false, limited = false;
            String lyricSource="miss", artworkSource="miss";
            String outcome = "ready";
            try {
                SongInfo info = SongInfo.fromTag(new JSONObject(payload), 0);
                UnifiedLyricsStore store = UnifiedLyricsStore.get(context);
                UnifiedLyricsStore.Record record = store.get(key);
                lyricSource = record == null ? "miss" : "unified:"+record.sourceId;
                lyricReady = record != null && (record.hasTimeline() || "none".equals(record.status));
                if (!lyricReady) {
                    NativeLyricsRepository.Result r = NativeLyricsRepository.get(context).load(info, 0,
                        null, () -> !cancelled.getAsBoolean() && runToken.equals(token(true)) && networkAllowed());
                    limited = r.status == NativeLyricsRepository.Status.RATE_LIMITED;
                    if (r.hasTimeline()) {
                        String raw = LyricVariantConverter.convertLyricInfoJson(context, r.json);
                        LyricTimelineAuthority.commitNative(store, key, raw, r.hasTranslation,
                            "native-"+r.source, LyricVariantConverter.currentRule(context).id);
                        lyricReady = true;
                    } else if(r.status == NativeLyricsRepository.Status.NOT_FOUND){
                        store.put(key,"none",null,false,false,"native-none","native",false,LyricVariantConverter.currentRule(context).id);
                        lyricReady=true;
                    }
                    outcome = r.status.name();
                    lyricSource = r.source+":"+r.status.name();
                }
                if (cancelled.getAsBoolean() || !runToken.equals(token(true))) break;
                NativeArtworkRepository art = NativeArtworkRepository.get(context);
                artworkReady = info.artworkUrl.isEmpty() || art.cachedFile(info.artworkUrl) != null;
                artworkSource = artworkReady ? "disk-or-not-required" : "network";
                if (!artworkReady && networkAllowed()) {
                    art.ensureFile(info.artworkUrl, false); artworkReady = art.cachedFile(info.artworkUrl)!=null;
                }
            } catch (Exception error) { outcome = error.getClass().getSimpleName(); }
            if(!"ready".equals(outcome)&&!lyricReady&&!limited)preferences.edit().putString("lastError",outcome).apply();
            synchronized (this) {
                if (pausedByClear || cancelled.getAsBoolean() || !runToken.equals(token(true))) break;
                ContentValues v = new ContentValues();
                v.put("state", lyricReady && artworkReady ? 1 : attempt >= 2 ? 2 : 0);
                v.put("lyricState",lyricReady?"available":limited?"rate-limited":"retry");v.put("artworkState",artworkReady?"available":"retry");
                v.put("attempt", attempt+1);
                v.put("due", Math.max(System.currentTimeMillis()+ResourceCachePolicy.retryDelay(attempt, limited),
                    Math.max(NativeLyricsRepository.get(context).retryNotBefore(), NativeArtworkRepository.get(context).retryNotBefore())));
                getWritableDatabase().update("tasks", v, "song=?", new String[]{key});
            }
            if(lyricReady&&artworkReady)preferences.edit().putLong("lastSuccess",System.currentTimeMillis()).apply();
            preferences.edit().putString("phase",!lyricReady?"lyrics":!artworkReady?"artwork":"verified").apply();
            PlaybackDiagnostics.note("resource-cache", new JSObject()
                .put("playlistId", runToken).put("song", PlaybackDiagnostics.anonKey(key))
                .put("priority", priority).put("lyricsReady", lyricReady).put("artworkReady", artworkReady)
                .put("lyricSource",lyricSource).put("artworkSource",artworkSource)
                .put("attempt", attempt+1).put("outcome", outcome));
        }
        try (Cursor c=getReadableDatabase().rawQuery("SELECT count(*) FROM tasks WHERE state=0", null)) {
            return !pausedByClear && c.moveToFirst() && c.getInt(0)>0;
        }
    }
    private synchronized void auditFiles(){
        if(System.currentTimeMillis()-lastAudit<30000)return;lastAudit=System.currentTimeMillis();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT song,payload FROM tasks WHERE state=1",null)){
            while(c.moveToNext()){
                JSONObject payload=new JSONObject(c.getString(1));String key=c.getString(0),art=payload.optString("artwork");
                UnifiedLyricsStore.Record lyric=UnifiedLyricsStore.get(context).get(key);
                boolean lyrics=lyric!=null&&UnifiedLyricsStore.get(context).hasDiskRecord(key)&&(lyric.hasTimeline()||"none".equals(lyric.status));
                if(!lyrics||(!art.isEmpty()&&NativeArtworkRepository.get(context).cachedFile(art)==null))
                    getWritableDatabase().execSQL("UPDATE tasks SET state=0,attempt=0,due=0 WHERE song=?",new Object[]{key});
            }
        }catch(Exception error){jobNote("audit-failed",error.getClass().getSimpleName());}
    }
    public JSObject status() {
        auditFiles();
        JSObject out=new JSObject().put("playlistId",token(false))
            .put("enabled",preferences.getBoolean("enabled",true)).put("wifiOnly",preferences.getBoolean("wifiOnly",false));
        try(Cursor c=getReadableDatabase().rawQuery("SELECT count(*),sum(CASE WHEN state=1 THEN 1 ELSE 0 END),sum(CASE WHEN state=2 THEN 1 ELSE 0 END) FROM tasks",null)){
            if(c.moveToFirst())out.put("total",c.getInt(0)).put("completed",c.getInt(1)).put("failed",c.getInt(2));
        }
        try (Cursor c=getReadableDatabase().rawQuery("SELECT expected,descriptor,catalogOffset,catalogComplete FROM manifest WHERE id=1", null)) {
            if(c.moveToFirst()) {
                try { if(!c.isNull(1))out.put("descriptor",new JSONObject(c.getString(1))); }catch(Exception ignored) { }
                out.put("catalogOffset",c.getInt(2));
                int found=out.optInt("total"); out.put("discovered",found).put("playlistTotal",c.getInt(0)).put("total",c.getInt(3)==1?found:Math.max(found,c.getInt(0))).put("metadataComplete",c.getInt(3)==1); }
        }
        SongInfoLoader loader=SongInfoLoader.get();
        String current=loader==null?"":loader.currentSongKey();
        UnifiedLyricsStore.Record r=UnifiedLyricsStore.get(context).get(current);
        JSONObject meta=metadata(current);
        out.put("currentSong",PlaybackDiagnostics.anonKey(current)).put("currentHasTimeline",r!=null&&r.hasTimeline())
            .put("currentLyricState",r==null?"pending":r.status).put("currentVersion",r==null?"":r.lyricsHash+"@"+r.revision)
            .put("currentArtworkLocal",meta!=null&&NativeArtworkRepository.get(context).cachedFile(meta.optString("artwork"))!=null);
        out.put("currentArtworkState",meta==null?"identity-missing":meta.optString("artwork").isEmpty()?"not-required":out.optBoolean("currentArtworkLocal")?"local":"miss");
        out.put("networkAllowed", networkAllowed()).put("paused",pausedByClear);
        long due=nextDue();
        out.put("pending",Math.max(0,out.optInt("discovered")-out.optInt("completed")-out.optInt("failed")))
            .put("nextDue",due).put("jobState",draining.get()?"running":"running".equals(preferences.getString("jobState","unknown"))?"unknown":preferences.getString("jobState","unknown"))
            .put("lastJobStart",preferences.getLong("lastJobStart",0)).put("lastJobEnd",preferences.getLong("lastJobEnd",0))
            .put("lastSuccess",preferences.getLong("lastSuccess",0)).put("lastError",preferences.getString("lastError",""))
            .put("nextRunAt",preferences.getLong("nextRunAt",0)).put("phase",preferences.getString("phase",""));
        out.put("running",draining.get());
        if(System.currentTimeMillis()-lastQualityAt>30000){
        int confirmed=0,provisional=0,none=0;
        try(Cursor c=getReadableDatabase().rawQuery("SELECT song FROM tasks",null)){while(c.moveToNext()){
            UnifiedLyricsStore.Record row=UnifiedLyricsStore.get(context).get(c.getString(0));
            if(row==null)continue;if("none".equals(row.status))none++;else if(row.hasTimeline()){if(row.userChoice||"stage".equals(row.confirmedBy))confirmed++;else provisional++;}
        }}
        qualityConfirmed=confirmed;qualityProvisional=provisional;qualityNone=none;lastQualityAt=System.currentTimeMillis();}
        out.put("confirmedLyrics",qualityConfirmed).put("provisionalLyrics",qualityProvisional).put("noLyrics",qualityNone);
        try(Cursor c=getReadableDatabase().rawQuery("SELECT sum(CASE WHEN platformDone=1 THEN 1 ELSE 0 END),sum(CASE WHEN platformDone=0 THEN 1 ELSE 0 END),sum(CASE WHEN platformDone=0 AND platformAttempt>=2 THEN 1 ELSE 0 END) FROM tasks",null)){
            if(c.moveToFirst())out.put("platformCompleted",c.getInt(0)).put("platformPending",c.getInt(1)).put("platformFailed",c.getInt(2));
        }
        return out.put("cachedSongs",UnifiedLyricsStore.get(context).diskRecordCount()).put("lyricsBytes",UnifiedLyricsStore.get(context).diskBytes()+NativeLyricsRepository.get(context).diskBytes())
            .put("artworkBytes",NativeArtworkRepository.get(context).diskBytes());
    }
    public JSObject platformCandidates() throws Exception {
        JSONArray tracks=new JSONArray();
        if(networkAllowed()) try(Cursor c=getReadableDatabase().rawQuery("SELECT payload FROM tasks WHERE platformDone=0 AND platformAttempt<2 AND platformDue<=? ORDER BY priority,ordinal LIMIT 1",new String[]{String.valueOf(System.currentTimeMillis())})) {
            while(c.moveToNext()) tracks.put(new JSONObject(c.getString(0)));
        }
        return new JSObject().put("playlistId",token(false)).put("allowed",networkAllowed()).put("tracks",tracks);
    }
    public void platformResult(String key, boolean success) {
        getWritableDatabase().execSQL("UPDATE tasks SET platformDone=?,platformAttempt=platformAttempt+1,platformDue=? WHERE song=?",new Object[]{success?1:0,System.currentTimeMillis()+300000L,key});
    }
    public JSONObject metadata(String key) {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT payload FROM tasks WHERE song=?",new String[]{key})) {
            return c.moveToFirst() ? new JSONObject(c.getString(0)) : null;
        } catch(Exception ignored) { return null; }
    }
    public void clearDownloadable() {
        pausedByClear = true;preferences.edit().putBoolean("paused",true).apply();
        JobScheduler js=(JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if(js!=null)js.cancel(JOB_ID);
        UnifiedLyricsStore.get(context).clearDownloadable();
        NativeLyricsRepository.get(context).clearDownloadable();
        NativeArtworkRepository.get(context).clearDownloadable();
        getWritableDatabase().execSQL("UPDATE tasks SET state=0,attempt=0,due=0,platformDone=0,platformAttempt=0,platformDue=0");
        // Do not immediately redownload everything the user just cleared; next playback resumes.
    }
}
