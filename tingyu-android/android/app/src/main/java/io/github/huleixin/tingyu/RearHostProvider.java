package io.github.huleixin.tingyu;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Binder;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostProvider.java
/** UID-checked, session-scoped pipes. No credentials, private files, HTTP server or large Binder payloads. */
public final class RearHostProvider extends ContentProvider {
    private final Binder lifeline=new Binder();
    private final ThreadPoolExecutor streams=new ThreadPoolExecutor(2,4,30,TimeUnit.SECONDS,new ArrayBlockingQueue<>(64));
    private long lastAction;
    @Override public boolean onCreate(){RearHostUpdates.bind(getContext());return true;}
    private void enforceHost(){
        try{
            int expected=getContext().getPackageManager().getApplicationInfo(RearHostContract.TARGET,0).uid;
            if(Binder.getCallingUid()!=expected)throw new SecurityException("Rear host UID only");
        }catch(android.content.pm.PackageManager.NameNotFoundException error){throw new SecurityException("Rear host missing");}
    }
    private void enforceSession(String session){
        enforceHost();
        if(!LspRearBridge.selected(getContext()) || !RearHostBridge.matches(session))throw new SecurityException("Retired host lease");
    }
    @Override public Bundle call(String method,String arg,Bundle extras){
        try{enforceHost();}
        catch(SecurityException error){
            // 记录被拒绝的调用方 UID：没有这一条，「hostConnected=false」无法区分
            // 「模块没加载」「Provider 不可见」和「UID 校验失败」。
            RearLyricsTrace.record(getContext(),"host-call-rejected","uid="+Binder.getCallingUid()+", method="+method);
            throw error;
        }
        if(extras==null)throw new IllegalArgumentException("No host packet");
        Bundle out=new Bundle();
        if("register".equals(method)){
            int priority=extras.getInt("priority",1);
            String stage=extras.getString("stage",""),error=extras.getString("error","");
            String build=extras.getString("build",""),process=extras.getString("process","");
            RearLyricsTrace.record(getContext(),"host-register-attempt","uid="+Binder.getCallingUid()
                +", priority="+priority+", process="+process+", stage="+stage+", build="+build);
            try{RearHostBridge.connect(getContext(),extras.getBinder("service"),extras.getInt("protocol"),
                extras.getString("profile","背屏中心宿主已连接"),priority,stage,error,build,process);}
            catch(Exception error2){
                RearLyricsTrace.record(getContext(),"host-register-failed","uid="+Binder.getCallingUid()+", "+error2);
                throw new SecurityException("Host connection rejected",error2);
            }
            RearLyricsTrace.record(getContext(),"host-register-accepted","process="+process+", protocol="+extras.getInt("protocol")+", connected="+RearHostBridge.connected()+", "+extras.getString("profile",""));
            out.putBinder("lifeline",lifeline);out.putInt("appUid",getContext().getApplicationInfo().uid);return out;
        }
        String session=extras.getString("session","");enforceSession(session);
        if("report".equals(method)){
            String event=extras.getString("event","");
            if(!RearHostContract.knownEvent(event))throw new IllegalArgumentException("Invalid host event");
            RearHostBridge.report(getContext(),session,event,extras.getInt("display",-1),extras.getString("reason",""));
        }else if("action".equals(method)){
            String action=extras.getString("action","");
            if(!java.util.Arrays.asList("play","pause","previous","next").contains(action) || !ownOutput())throw new SecurityException("Not Tingyu output");
            synchronized(this){long now=android.os.SystemClock.elapsedRealtime();if(now-lastAction>=250){lastAction=now;FoliaNativePlugin.emitMediaAction(action);}}
        }else if("trace".equals(method)){
            Uri uri=Uri.parse(extras.getString("url",""));
            if(!"rear.folia.local".equals(uri.getHost()) || !"/__folia_rear/trace".equals(uri.getPath()))throw new IllegalArgumentException("Invalid trace");
            RearLyricsWebClient.recordTrace(getContext(),uri);
        }else throw new IllegalArgumentException("Unsupported host operation");
        return out;
    }
    private boolean ownOutput(){
        org.json.JSONObject owner=RearNativeTrack.snapshot();
        String engine=owner.optString("engine");
        return ("media3".equals(engine)||"compatible".equals(engine)) && !owner.optString("songKey").isEmpty();
    }
    @Override public ParcelFileDescriptor openFile(Uri request,String mode)throws FileNotFoundException{
        enforceSession(request.getQueryParameter("session"));
        if(!"r".equals(mode))throw new SecurityException("Read only");
        Uri url=Uri.parse(request.getQueryParameter("url")==null?"":request.getQueryParameter("url"));
        if(!"https".equals(url.getScheme())&&!"http".equals(url.getScheme()))throw new SecurityException("HTTPS resource only");
        String resource=url.getPath();
        try{
            InputStream source;
            if("rear.folia.local".equals(url.getHost())){
                if(!"https".equals(url.getScheme()))throw new SecurityException("HTTPS local origin only");
                if(resource==null || resource.contains("..") || resource.contains("\\"))throw new SecurityException("Invalid resource");
                if("/__folia_rear/state".equals(resource)){
                    io.github.huleixin.tingyu.playback.LyricSyncLedger.get().rearHeartbeat(android.os.SystemClock.elapsedRealtime());
                    int revision=-1;try{revision=Integer.parseInt(url.getQueryParameter("revision"));}catch(Exception ignored){}
                    source=bytes(RearLyricsState.snapshot(revision));
                }else if("/__folia_rear/lyrics".equals(resource))source=bytes(RearNativeLyricLines.json(getContext(),url.getQueryParameter("key"),url.getQueryParameter("epoch")));
                else if("/registerSW.js".equals(resource))source=bytes("/* no host service worker */");
                else if(resource.startsWith("/__folia_rear/"))throw new FileNotFoundException("Unsupported host resource");
                else source=getContext().getAssets().open("public"+("/".equals(resource)?"/rear-lyrics.html":resource));
            }else{
                android.webkit.WebResourceResponse artwork=io.github.huleixin.tingyu.playback.SharedArtworkAccess.intercept(getContext(),url.toString());
                if(artwork==null)throw new SecurityException("Unsupported private resource");
                source=artwork.getData();
            }
            ParcelFileDescriptor[] pipe=ParcelFileDescriptor.createPipe();
            try{streams.execute(()->{try(InputStream in=source;OutputStream out=new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])){byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);}catch(Exception ignored){}});}
            catch(RuntimeException error){source.close();pipe[0].close();pipe[1].close();throw error;}
            return pipe[0];
        }catch(SecurityException error){throw error;}
        catch(Exception error){throw new FileNotFoundException("Rear resource unavailable: "+error.getClass().getSimpleName());}
    }
    private static InputStream bytes(String value){return new java.io.ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8));}
    @Override public Cursor query(Uri u,String[] p,String s,String[] a,String o){throw new SecurityException("No query");}
    @Override public String getType(Uri u){return null;}
    @Override public Uri insert(Uri u,ContentValues v){throw new SecurityException("Read only");}
    @Override public int delete(Uri u,String s,String[] a){throw new SecurityException("Read only");}
    @Override public int update(Uri u,ContentValues v,String s,String[] a){throw new SecurityException("Read only");}
}

