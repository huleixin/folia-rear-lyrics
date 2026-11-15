package io.github.huleixin.tingyu.playback;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

// Private persistent audio cache; byte writes and media verification use a bounded IO queue.
public final class AudioCacheStore {
    public static final long MAX_FILE=256L*1024*1024;
    private static volatile AudioCacheStore instance;
    public static AudioCacheStore get(Context context){if(instance==null)synchronized(AudioCacheStore.class){if(instance==null)instance=new AudioCacheStore(context.getApplicationContext());}return instance;}
    public static AudioCacheStore peek(){return instance;}
    final File dir; final SharedPreferences prefs;
    private final Context context;
    private final ThreadPoolExecutor io=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(32),r->new Thread(r,"tingyu-stream-cache"));
    private final Map<String,Binding> bindings=new LinkedHashMap<>();
    private final Map<String,Part> parts=new LinkedHashMap<>();
    private volatile long generation;
    private volatile long usedBytes;
    private volatile int cachedCount;
    private final java.util.Set<String> completedKeys=new java.util.HashSet<>();
    private static final java.util.regex.Pattern KEY_VARIANT=java.util.regex.Pattern.compile("^offline_v1_(standard|high|lossless|hires)_[a-f0-9]{64}_");
    private int uniqueTracks(){return (int)completedKeys.stream().map(key->KEY_VARIANT.matcher(key).replaceFirst("")).distinct().count();}
    private long networkCheckedAt;private boolean wifiEligible;
    private long reservedBytes;
    private AudioCacheStore(Context c){context=c;dir=new File(c.getFilesDir(),"audio-offline-v1");dir.mkdirs();prefs=c.getSharedPreferences("audio-offline-v1",0);
        android.content.SharedPreferences resources=c.getSharedPreferences("resource-cache-policy",0);
        if(!prefs.getBoolean("unifiedWifi",false)){boolean wifi=prefs.getBoolean("wifiOnly",true)||resources.getBoolean("wifiOnly",false);prefs.edit().putBoolean("wifiOnly",wifi).putBoolean("unifiedWifi",true).apply();resources.edit().putBoolean("wifiOnly",wifi).apply();}
        prefs.edit().remove("limitGb").apply();submit(()->prune(0));}
    public boolean enabled(){return prefs.getBoolean("enabled",false);}
    public String route(){return prefs.getString("route","");}
    public boolean routeMatches(NativePlaylist.Track track){try{return route().equals(new JSONObject(track.providerData).optString("audioCacheRoute"));}catch(Exception e){return false;}}
    public synchronized void changeRoute(String route){
        generation++;bindings.clear();for(Part p:parts.values()){p.failed=true;p.file.delete();}parts.clear();reservedBytes=0;
        prefs.edit().putString("route",route).apply();
    }
    private boolean canWrite(Binding binding){
        if(!enabled()&&!binding.download)return false;if(!wifiOnly())return true;
        long now=android.os.SystemClock.elapsedRealtime();if(now-networkCheckedAt<1000)return wifiEligible;networkCheckedAt=now;
        android.net.ConnectivityManager cm=(android.net.ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
        android.net.NetworkCapabilities n=cm==null?null:cm.getNetworkCapabilities(cm.getActiveNetwork());
        wifiEligible=n!=null&&n.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)&&!cm.isActiveNetworkMetered();return wifiEligible;
    }
    public boolean wifiOnly(){return prefs.getBoolean("wifiOnly",true);}
    public boolean autoPlaylist(){return prefs.getBoolean("autoPlaylist",false);}
    static String hash(String text){try{byte[] b=MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));StringBuilder s=new StringBuilder();for(byte v:b)s.append(String.format(java.util.Locale.ROOT,"%02x",v&255));return s.toString();}catch(Exception e){throw new IllegalStateException(e);}}
    private static String readMetadata(File file)throws Exception {
        if(file.length()>65536)throw new java.io.IOException("metadata limit");
        try(java.io.FileInputStream input=new java.io.FileInputStream(file);java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){
            byte[] b=new byte[4096];int n;while((n=input.read(b))!=-1){out.write(b,0,n);if(out.size()>65536)throw new java.io.IOException("metadata limit");}return out.toString("UTF-8");
        }
    }
    public boolean containsFile(File file)throws java.io.IOException{return file!=null&&file.isFile()&&file.getCanonicalFile().getParentFile().equals(dir.getCanonicalFile())&&file.getName().matches("[a-f0-9]{64}\\.audio");}
    private static final class Binding {final String key,actual,quality;final long duration;final boolean download;Binding(String k,String a,long d,String q,boolean bulk){key=k;actual=a;duration=d;quality=q;download=bulk;}}
    public void bind(String url,String key,String actual,long duration){bind(url,key,actual,duration,"");}
    public void bind(String url,String key,String actual,long duration,String quality){bind(url,key,actual,duration,quality,false);}
    public synchronized void bind(String url,String key,String actual,long duration,String quality,boolean download){if((!enabled()&&!download)||key.isEmpty()||key.length()>2048)return;bindings.put(url,new Binding(key,actual,duration,quality,download));while(bindings.size()>256)bindings.remove(bindings.keySet().iterator().next());}
    public synchronized void alias(String original,String proxy){Binding b=bindings.get(original);if(b!=null){bindings.put(proxy,b);while(bindings.size()>256)bindings.remove(bindings.keySet().iterator().next());}}
    public boolean hasFiles(String key){if(key==null||key.isEmpty())return false;String id=hash(key);return new File(dir,id+".audio").isFile()&&new File(dir,id+".json").isFile();}
    public synchronized File lookup(String key){try{if(key==null||key.isEmpty())return null;String id=hash(key);File f=new File(dir,id+".audio"),m=new File(dir,id+".json");if(!f.isFile()||!m.isFile())return null;JSONObject meta=new JSONObject(readMetadata(m));if(meta.optLong("size")!=f.length()||!key.equals(meta.optString("key")))return null;f.setLastModified(System.currentTimeMillis());return f;}catch(Exception e){return null;}}
    /** Read only verified entries; UI checks never update access times or request audio URLs. */
    public synchronized boolean isComplete(String key){try{if(key==null||key.isEmpty()||key.length()>2048)return false;String id=hash(key);File f=new File(dir,id+".audio"),m=new File(dir,id+".json");if(!f.isFile()||!m.isFile())return false;JSONObject meta=new JSONObject(readMetadata(m));return key.equals(meta.optString("key"))&&meta.optLong("size")==f.length();}catch(Exception error){return false;}}
    public org.json.JSONArray available(org.json.JSONArray keys){org.json.JSONArray result=new org.json.JSONArray();if(keys!=null)for(int i=0;i<Math.min(100,keys.length());i++){String key=keys.optString(i);if(isComplete(key))result.put(key);}return result;}
    public JSONObject info(String key){try{File f=new File(dir,hash(key)+".json");return new JSONObject(readMetadata(f));}catch(Exception e){return new JSONObject();}}
    private static final class Part {final File file;final Binding binding;final long total,generation;final AudioRangeCoverage ranges=new AudioRangeCoverage();volatile boolean failed,verifying;Part(File f,Binding b,long n,long g){file=f;binding=b;total=n;generation=g;}}
    public final class Sink {
        final String representation;final Part part;long position;boolean closed;
        Sink(String r,Part p,long start){representation=r;part=p;position=start;}
        public void write(byte[] bytes,int offset,int count){if(closed||part.failed||part.verifying||count<=0)return;long start=position;position+=count;if(position>part.total){part.failed=true;return;}byte[] copy=java.util.Arrays.copyOfRange(bytes,offset,offset+count);
            if(!submitWrite(()->{synchronized(AudioCacheStore.this){if(!canWrite(part.binding)||part.failed||part.verifying||part.generation!=generation||parts.get(representation)!=part)return;try(RandomAccessFile out=new RandomAccessFile(part.file,"rw")){out.seek(start);out.write(copy);part.ranges.add(start,start+count);}catch(Exception e){part.failed=true;}}if(part.ranges.complete(part.total))finish(representation,part);},part.binding.download))part.failed=true;
        }
        public void close(){if(closed)return;closed=true;if(!submitWrite(()->finish(representation,part),part.binding.download))part.failed=true;}
    }
    /** Unknown lengths, text/DRM responses, encoded transfers and inconsistent ranges never enter the cache. */
    public synchronized Sink open(String url,long start,long total,String mime,String validator){
        Binding b=bindings.get(url);if(b==null||!canWrite(b)||total<16384||total>MAX_FILE||start<0||start>=total||lookup(b.key)!=null)return null;
        if(mime==null||mime.matches("(?i).*(text/|json|xml|mpegurl|dash|octet-stream\\+).*"))return null;
        String representation=hash(url+"|"+validator+"|"+total+"|"+b.key);
        Part p=parts.get(representation);
        if(p!=null&&p.failed){removePart(representation,p);p=null;}
        if(p==null){
            while(parts.size()>=4){String oldest=parts.keySet().iterator().next();Part old=parts.get(oldest);old.failed=true;removePart(oldest,old);}
            if(dir.getUsableSpace()<reservedBytes+total+64L*1024*1024)return null;
            p=new Part(new File(dir,representation+".part"),b,total,generation);parts.put(representation,p);reservedBytes+=total;
        }
        if(p.verifying)return null;
        return new Sink(representation,p,start);
    }
    // Downloads apply bounded backpressure instead of discarding bytes when disk IO lags.
    private boolean submitWrite(Runnable work,boolean download){if(submit(work))return true;if(!download)return false;try{return io.getQueue().offer(work,15,TimeUnit.SECONDS);}catch(InterruptedException error){Thread.currentThread().interrupt();return false;}}
    private boolean submit(Runnable work){try{io.execute(work);return true;}catch(java.util.concurrent.RejectedExecutionException e){return false;}}
    private synchronized void removePart(String id,Part p){if(parts.get(id)==p){p.failed=true;parts.remove(id);reservedBytes-=p.total;if(p.generation==generation)p.file.delete();}}
    private void finish(String id,Part p){
        synchronized(this){if(!canWrite(p.binding)||p.generation!=generation||p.failed||parts.get(id)!=p){removePart(id,p);return;}
        if(!p.ranges.complete(p.total)||p.verifying)return;p.verifying=true;}
        MediaExtractor media=new MediaExtractor();
        try {
            media.setDataSource(p.file.getAbsolutePath());MediaFormat audio=null;
            for(int i=0;i<media.getTrackCount();i++){MediaFormat fmt=media.getTrackFormat(i);if(fmt.getString(MediaFormat.KEY_MIME).startsWith("audio/")){audio=fmt;media.selectTrack(i);break;}}
            if(audio==null||!audio.containsKey(MediaFormat.KEY_DURATION))throw new IllegalStateException("no complete audio");
            long duration=audio.getLong(MediaFormat.KEY_DURATION)/1000;
            if(p.binding.duration<=0||Math.abs(duration-p.binding.duration)>Math.min(5000,p.binding.duration*.03))throw new IllegalStateException("duration mismatch");
            if(media.getDrmInitData()!=null||(media.getPsshInfo()!=null&&!media.getPsshInfo().isEmpty())||media.getSampleTime()<0||(media.getSampleFlags()&MediaExtractor.SAMPLE_FLAG_ENCRYPTED)!=0)throw new IllegalStateException("encrypted audio");
            java.nio.ByteBuffer sample=java.nio.ByteBuffer.allocate(1024*1024);
            if(media.readSampleData(sample,0)<=0)throw new IllegalStateException("missing first sample");
            media.seekTo(Math.max(0,(duration-1000)*1000),MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            if(media.getSampleTime()<Math.max(0,(duration-5000)*1000)||media.readSampleData(sample,0)<=0||(media.getSampleFlags()&MediaExtractor.SAMPLE_FLAG_ENCRYPTED)!=0)throw new IllegalStateException("missing last sample");
            String key=hash(p.binding.key);File dest=new File(dir,key+".audio");
            JSONObject meta=new JSONObject().put("key",p.binding.key).put("actualSource",p.binding.actual).put("size",p.total).put("durationMs",duration).put("mime",audio.getString(MediaFormat.KEY_MIME)).put("cachedAt",System.currentTimeMillis()).put("qualityVerified",false).put("negotiatedQuality",p.binding.quality);
            if(audio.containsKey(MediaFormat.KEY_SAMPLE_RATE))meta.put("sampleRate",audio.getInteger(MediaFormat.KEY_SAMPLE_RATE));if(audio.containsKey(MediaFormat.KEY_BIT_RATE))meta.put("bitrate",audio.getInteger(MediaFormat.KEY_BIT_RATE));
            File tmp=new File(dir,id+"-"+p.generation+".json.tmp");try(java.io.FileOutputStream out=new java.io.FileOutputStream(tmp)){out.write(meta.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}
            synchronized(this){if(p.generation!=generation||parts.get(id)!=p||p.failed)throw new IllegalStateException("cache cleared");
            new File(dir,key+".json").delete();long replaced=dest.length();dest.delete();usedBytes=Math.max(0,usedBytes-replaced);if(!p.file.renameTo(dest))throw new IllegalStateException("commit failed");if(!tmp.renameTo(new File(dir,key+".json"))){dest.delete();throw new IllegalStateException("metadata commit failed");}usedBytes+=p.total;completedKeys.add(p.binding.key);cachedCount=uniqueTracks();}
            PlaybackDiagnostics.note("audio-cache-complete",new JSONObject().put("bytes",p.total).put("durationMs",duration));
        }catch(Exception e){try{PlaybackDiagnostics.note("audio-cache-rejected",new JSONObject().put("kind",e.getClass().getSimpleName()));}catch(Exception ignored){}}
        finally{media.release();synchronized(this){if(p.generation==generation&&parts.get(id)==p)new File(dir,id+"-"+p.generation+".json.tmp").delete();removePart(id,p);}}
    }
    private synchronized void prune(long incoming){
        File[] files=dir.listFiles();if(files==null)return;long used=0,now=System.currentTimeMillis();completedKeys.clear();
        for(File f:files){
            if(f.getName().endsWith(".audio")){
                File metadata=new File(dir,f.getName().replace(".audio",".json"));
                try{JSONObject meta=new JSONObject(readMetadata(metadata));String key=meta.optString("key");
                    if(key.isEmpty()||meta.optLong("size")!=f.length()||!f.getName().equals(hash(key)+".audio"))throw new java.io.IOException("invalid cache");
                    used+=f.length();completedKeys.add(key);
                }catch(Exception error){f.delete();metadata.delete();}
            }else if(f.getName().endsWith(".json")&&!new File(dir,f.getName().replace(".json",".audio")).isFile())f.delete();
            else if(f.getName().endsWith(".json.tmp")&&now-f.lastModified()>60000)f.delete();
            else if(f.getName().endsWith(".part")&&now-f.lastModified()>24*60*60000L)f.delete();
        }
        usedBytes=used;cachedCount=uniqueTracks();
    }
    public synchronized void clear(){generation++;bindings.clear();for(Part p:parts.values())p.failed=true;parts.clear();reservedBytes=0;usedBytes=0;cachedCount=0;completedKeys.clear();File[] files=dir.listFiles();if(files!=null)for(File f:files)f.delete();}
    public boolean awaitWrites()throws InterruptedException{java.util.concurrent.CountDownLatch latch=new java.util.concurrent.CountDownLatch(1);if(!submit(latch::countDown))return false;return latch.await(10,TimeUnit.SECONDS);}
    public static String key(NativePlaylist.Track track,String quality){try{return new JSONObject(track.providerData).optJSONObject("audioCacheKeys").optString(quality,"");}catch(Exception e){return "";}}
    public synchronized void invalidate(String key){File f=new File(dir,hash(key)+".audio");long size=f.length();if(f.delete()){usedBytes=Math.max(0,usedBytes-size);completedKeys.remove(key);cachedCount=uniqueTracks();}new File(dir,hash(key)+".json").delete();}
    public JSONObject status(){JSONObject s=new JSONObject();try{s.put("enabled",enabled()).put("wifiOnly",wifiOnly()).put("autoPlaylist",autoPlaylist()).put("bytes",usedBytes).put("cached",cachedCount);}catch(Exception ignored){}return s;}
    public synchronized void configure(JSONObject data){networkCheckedAt=0;SharedPreferences.Editor e=prefs.edit();for(String k:new String[]{"enabled","wifiOnly","autoPlaylist"})if(data.has(k))e.putBoolean(k,data.optBoolean(k));e.remove("limitGb");e.apply();if(data.has("wifiOnly"))context.getSharedPreferences("resource-cache-policy",0).edit().putBoolean("wifiOnly",data.optBoolean("wifiOnly")).apply();}
}
