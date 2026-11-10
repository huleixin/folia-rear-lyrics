package io.github.huleixin.tingyu.playback;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/PlaybackSnapshotStore.java
/** Versioned queue and small cursor, each atomically replaced with last-good backup. No audio URLs. */
public final class PlaybackSnapshotStore {
    private final File dir;
    private final Set<String> validPrimary=new HashSet<>();
    private JSONObject queue, cursor, intent;
    private long intentRevision;
    private JSONArray nativeOrder;
    private String nativeMode,nativeLoopMode;
    private String nativeAnchor = "";
    private String state = "empty";
    PlaybackSnapshotStore(File dir) {
        this.dir=dir; dir.mkdirs();
        queue=read("queue");
        if(queue!=null) {
            if(queue.optInt("v")!=1)state="unsupported";
            else if(!valid(queue))state="corrupt";
            else state=queue.optBoolean("cleared")?"cleared":"restored";
        } else if(new File(dir,"queue.json").exists() || new File(dir,"queue.bak").exists())state="corrupt";
        cursor=read("cursor");intent=read("intent");
        intentRevision=intent==null?0:intent.optLong("revision");
        if(intent!=null&&intent.optBoolean("cleared")&&(queue==null||intentRevision>=queue.optLong("revision")))state="cleared";
    }
    public synchronized JSONObject read() throws Exception {
        JSONObject out=new JSONObject().put("status",state).put("revision",revision());
        if(!"restored".equals(state))return out;
        JSONObject result=new JSONObject(queue.toString());
        if(cursor!=null && cursor.optInt("v")==1 && queue.optString("id").equals(cursor.optString("queueId"))
                && contains(cursor.optString("currentKey"))) {
            result.put("currentKey",cursor.optString("currentKey")).put("positionMs",Math.max(0,cursor.optLong("positionMs")))
                .put("mode",cursor.optString("mode",queue.optString("mode")))
                .put("stopped",cursor.optBoolean("stopped")).put("wasPaused",cursor.optBoolean("paused",true));
        }
        if(intent!=null&&intent.optBoolean("stopped")&&queue.optString("id").equals(intent.optString("queueId")))result.put("stopped",true);
        return out.put("status",result.optBoolean("stopped")?"stopped":"restored").put("snapshot",result);
    }
    public synchronized long revision(){return Math.max(intentRevision,queue==null?0:queue.optLong("revision"));}
    public synchronized boolean contains(String key) {
        if(queue==null || key==null || key.isEmpty())return false;
        JSONArray rows=queue.optJSONArray("queue");
        if(rows!=null)for(int i=0;i<rows.length();i++)if(rows.optJSONObject(i)!=null&&key.equals(rows.optJSONObject(i).optString("songKey")))return true;
        return false;
    }
    public synchronized long save(JSONObject incoming,long expected,String liveKey) throws Exception {
        if(expected!=revision())throw new IOException("stale-revision");
        JSONObject next=new JSONObject(incoming.toString());
        if(next.optInt("v")!=1||!valid(next))throw new IOException("invalid-queue");
        if(liveKey!=null&&!liveKey.isEmpty()&&!next.optBoolean("cleared")&&!liveKey.equals(next.optString("currentKey")))
            throw new IOException("stale-js-current");
        if(nativeOrder!=null && nativeOrder.length()>0 && next.optString("currentKey").equals(nativeAnchor)
                && next.optString("mode").equals(nativeMode) && (queue==null||sameRows(queue,next)))
            next.put("order",mergeOrder(next.optJSONArray("order"),nativeOrder,next.optJSONArray("queue"))).put("loopMode",nativeLoopMode);
        next.put("v",1).put("revision",revision()+1).put("id",UUID.randomUUID().toString()).put("at",System.currentTimeMillis());
        if(liveKey!=null&&!liveKey.isEmpty()&&cursor!=null && next.optString("currentKey").equals(cursor.optString("currentKey"))&&cursor.optLong("at")>=next.optLong("capturedAt")) {
            next.put("positionMs",cursor.optLong("positionMs",0));
        }
        if(next.optBoolean("cleared")) {
            intent=new JSONObject().put("v",1).put("cleared",true).put("revision",next.optLong("revision"));
            atomic("intent",intent);intentRevision=next.optLong("revision");state="cleared";
        } else if(queue!=null && next.optString("currentKey").equals(queue.optString("currentKey")) &&
            ((cursor!=null&&cursor.optBoolean("stopped"))||(intent!=null&&intent.optBoolean("stopped"))))next.put("stopped",true);
        atomic("queue",next);
        queue=next; cursor=null; state=next.optBoolean("cleared")?"cleared":"restored";
        if(!next.optBoolean("cleared")){intent=null;intentRevision=0;new File(dir,"intent.json").delete();new File(dir,"intent.bak").delete();}
        return revision();
    }
    public synchronized boolean checkpoint(String key,long position,boolean paused,String mode,boolean stopped) throws Exception {
        if(stopped&&!contains(key)&&!"cleared".equals(state)){
            JSONObject marker=new JSONObject().put("v",1).put("cleared",true).put("revision",revision()+1);
            atomic("intent",marker);intent=marker;intentRevision=marker.optLong("revision");state="cleared";return true;
        }
        if(!"restored".equals(state)||!contains(key))return false;
        stopped=stopped||(paused&&(queue.optBoolean("stopped")||(intent!=null&&intent.optBoolean("stopped")&&queue.optString("id").equals(intent.optString("queueId")))));
        JSONObject next=new JSONObject().put("v",1).put("queueId",queue.optString("id"))
            .put("currentKey",key).put("positionMs",Math.max(0,position)).put("paused",paused)
            .put("mode",mode).put("stopped",stopped).put("at",System.currentTimeMillis());
        if(stopped){intent=new JSONObject().put("v",1).put("queueId",queue.optString("id")).put("stopped",true);atomic("intent",intent);}
        atomic("cursor",next);cursor=next;
        if(!stopped&&!paused){intent=null;new File(dir,"intent.json").delete();new File(dir,"intent.bak").delete();}
        return true;
    }
    public synchronized void nativeOrder(JSONArray keys,String mode) throws Exception {nativeOrder(keys,mode,true);}
    public synchronized void nativeOrder(JSONArray keys,String mode,boolean loopAll) throws Exception {
        nativeOrder(keys,mode,loopAll,keys.optString(0));
    }
    public synchronized void nativeOrder(JSONArray keys,String mode,boolean loopAll,String anchor) throws Exception {
        nativeAnchor = anchor == null ? "" : anchor;
        nativeOrder=new JSONArray(keys.toString());nativeMode=mode;nativeLoopMode="shuffle".equals(mode)?(loopAll?"all":"off"):mode;
        if(!"restored".equals(state)||keys.length()==0||!contains(keys.optString(0)))return;
        queue.put("order",mergeOrder(queue.optJSONArray("order"),keys,queue.optJSONArray("queue"))).put("mode",mode).put("loopMode",nativeLoopMode);
        atomic("queue",queue);
        if(cursor!=null){cursor.put("mode",mode);atomic("cursor",cursor);}
    }
    public synchronized void mode(String mode) throws Exception {mode(mode,true);}
    public synchronized void mode(String mode,boolean loopAll) throws Exception {
        nativeMode=mode;nativeLoopMode="shuffle".equals(mode)?(loopAll?"all":"off"):mode;
        if(!"restored".equals(state))return;
        queue.put("mode",mode).put("loopMode",nativeLoopMode);atomic("queue",queue);
        if(cursor!=null){cursor.put("mode",mode);atomic("cursor",cursor);}
    }
    private static boolean sameRows(JSONObject a,JSONObject b) {
        JSONArray x=a.optJSONArray("queue"),y=b.optJSONArray("queue");
        if(x==null||y==null||x.length()!=y.length())return false;
        for(int i=0;i<x.length();i++)if(!x.optJSONObject(i).optString("songKey").equals(y.optJSONObject(i).optString("songKey")))return false;
        return true;
    }
    private static JSONArray mergeOrder(JSONArray old,JSONArray next,JSONArray rows) {
        Set<String> allowed=new HashSet<>(),tail=new HashSet<>(),seen=new HashSet<>();
        for(int i=0;i<rows.length();i++)allowed.add(rows.optJSONObject(i).optString("songKey"));
        for(int i=0;i<next.length();i++)tail.add(next.optString(i));
        JSONArray out=new JSONArray();
        for(int i=0;i<old.length();i++){String k=old.optString(i);if(allowed.contains(k)&&!tail.contains(k)&&seen.add(k))out.put(k);}
        for(int i=0;i<next.length();i++){String k=next.optString(i);if(allowed.contains(k)&&seen.add(k))out.put(k);}
        for(int i=0;i<rows.length();i++){String k=rows.optJSONObject(i).optString("songKey");if(seen.add(k))out.put(k);}
        return out;
    }
    private static boolean valid(JSONObject value) {
        JSONArray rows=value.optJSONArray("queue"),order=value.optJSONArray("order");
        if(rows==null||order==null)return false;
        if(value.optBoolean("cleared"))return rows.length()==0&&order.length()==0;
        Set<String> keys=new HashSet<>();
        for(int i=0;i<rows.length();i++) {
            JSONObject row=rows.optJSONObject(i);
            if(row==null||row.optString("songKey").isEmpty()||row.optJSONObject("song")==null||!keys.add(row.optString("songKey")))return false;
        }
        if(!keys.contains(value.optString("currentKey")))return false;
        Set<String> ordered=new HashSet<>();
        for(int i=0;i<order.length();i++)if(!keys.contains(order.optString(i))||!ordered.add(order.optString(i)))return false;
        return keys.equals(ordered);
    }
    private JSONObject read(String name) {
        for(String suffix:new String[]{".json",".bak"})try {
            File f=new File(dir,name+suffix);
            if(!f.isFile()||f.length()>32L*1024*1024)continue;
            ByteArrayOutputStream out=new ByteArrayOutputStream();
            try(InputStream in=new FileInputStream(f)){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}
            JSONObject result=new JSONObject(out.toString("UTF-8"));
            if("queue".equals(name)&&result.optInt("v")<=1&&(result.optInt("v")!=1||!valid(result)))continue;
            if("cursor".equals(name)&&(result.optInt("v")!=1||result.optString("queueId").isEmpty()||result.optString("currentKey").isEmpty()))continue;
            if("intent".equals(name)&&(result.optInt("v")!=1||(!result.optBoolean("cleared")&&!result.optBoolean("stopped"))))continue;
            if(".json".equals(suffix))validPrimary.add(name);
            return result;
        }catch(Exception ignored){}
        return null;
    }
    private void atomic(String name,JSONObject value) throws IOException {
        File target=new File(dir,name+".json"),temp=new File(dir,name+".tmp"),backup=new File(dir,name+".bak");
        byte[] bytes=value.toString().getBytes(StandardCharsets.UTF_8);
        if(bytes.length>32L*1024*1024)throw new IOException("snapshot-budget");
        try(FileOutputStream out=new FileOutputStream(temp)){out.write(bytes);out.getFD().sync();}
        if(target.exists()){
            // A corrupt primary must never replace the last-good backup we recovered from.
            if(!validPrimary.contains(name)&&backup.exists()){if(!target.delete())throw new IOException("invalid-primary-delete");}
            else{if(backup.exists()&&!backup.delete())throw new IOException("backup-delete");if(!target.renameTo(backup))throw new IOException("backup-rename");}
        }
        if(!temp.renameTo(target)){if(backup.exists())backup.renameTo(target);throw new IOException("atomic-rename");}
        validPrimary.add(name);
    }
}
