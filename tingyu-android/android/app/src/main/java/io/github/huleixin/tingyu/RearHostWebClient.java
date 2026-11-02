package io.github.huleixin.tingyu;

import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostWebClient.java
/** Same packaged rear-lyrics.html and iframe renderer; only the process boundary differs. */
final class RearHostWebClient extends WebViewClient {
    interface Events { void ready(); void failed(String reason); default void diagnostic(String stage,String detail){} }
    private final Context context;
    private final String session;
    private final Events events;
    private final RearHostSnapshotCache cache;
    void invalidate(){cache.invalidate();}
    private final java.util.Set<String> reported=java.util.concurrent.ConcurrentHashMap.newKeySet();
    private void diagnostic(String event,String detail){if(reported.size()<40&&reported.add(event))events.diagnostic(event,detail);}
    private static String localPath(String url){try{return Uri.parse(url).getPath();}catch(Exception e){return "invalid";}}
    @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){diagnostic("page-start",localPath(url));}
    @Override public void onPageCommitVisible(WebView view,String url){diagnostic("page-commit",localPath(url));}
    @Override public void onPageFinished(WebView view,String url){
        diagnostic("page-finished",localPath(url));
        view.evaluateJavascript("JSON.stringify({state:document.readyState,hidden:document.hidden,children:document.getElementById('root')?.childElementCount,frames:document.querySelectorAll('iframe').length})",value->diagnostic("js-probe",value));
    }
    private String readState(int revision)throws Exception{
        Uri read=Uri.parse("https://rear.folia.local/__folia_rear/state").buildUpon().appendQueryParameter("revision",String.valueOf(revision)).build();
        try(java.io.InputStream input=resource(read);java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream()){
            byte[] buffer=new byte[16384];int count;while((count=input.read(buffer))!=-1)bytes.write(buffer,0,count);
            return bytes.toString(StandardCharsets.UTF_8.name());
        }
    }
    String aodState()throws Exception{return readState(Integer.MAX_VALUE);}
    String aodLyrics(String key,String epoch)throws Exception{
        Uri url=Uri.parse("https://rear.folia.local/__folia_rear/lyrics").buildUpon().appendQueryParameter("key",key).appendQueryParameter("epoch",epoch).build();
        try(java.io.InputStream input=resource(url)){return new String(input.readAllBytes(),StandardCharsets.UTF_8);}
    }
    boolean followAod(){try{Bundle b=new Bundle();b.putString("session",session);Bundle result=context.getContentResolver().call(Uri.parse("content://"+RearHostContract.AUTHORITY),"aod",null,b);return result!=null&&result.getBoolean("enabled",true);}catch(Exception e){return false;}}
    private String state(Uri url)throws Exception{
        int requested=-1;try{requested=Integer.parseInt(url.getQueryParameter("revision"));}catch(Exception ignored){}
        return cache.get(requested,android.os.SystemClock.elapsedRealtime());
    }
    private java.io.InputStream resource(Uri url)throws Exception{
        Uri pipe=new Uri.Builder().scheme("content").authority(RearHostContract.AUTHORITY).path("resource")
            .appendQueryParameter("session",session).appendQueryParameter("url",url.toString()).build();
        // ContentResolver.openInputStream preserves APK asset offset/length through openAssetFile.
        java.io.InputStream input=context.getContentResolver().openInputStream(pipe);if(input==null)throw new java.io.FileNotFoundException();
        String path=url.getPath();
        String kind=path!=null&&path.endsWith(".html")?"html":path!=null&&path.endsWith(".js")?"script":path!=null&&path.endsWith(".css")?"css":null;
        if(kind==null)return input;
        return new java.io.FilterInputStream(input){
            long bytes;boolean completed;
            private void readResult(int n){if(n>0)bytes+=n;else if(n<0&&!completed){completed=true;diagnostic(kind+"-complete",path+", bytes="+bytes);}}
            @Override public int read()throws java.io.IOException{int v=in.read();readResult(v<0?-1:1);return v;}
            @Override public int read(byte[] b,int off,int len)throws java.io.IOException{int n=in.read(b,off,len);readResult(n);return n;}
        };
    }
    RearHostWebClient(Context context,String session,Events events){this.context=context;this.session=session;this.events=events;cache=new RearHostSnapshotCache(this::readState);}
    @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
        Uri url=request.getUrl();String path=url.getPath();
        if(!"rear.folia.local".equals(url.getHost())){
            if(!io.github.huleixin.tingyu.playback.SharedArtworkAccess.imageRequestUrl(url.toString()))return null;
        }
        try{
            if("/__folia_rear/boot".equals(path)){
                String step=url.getQueryParameter("stage");
                if(java.util.Arrays.asList("html-script","js-error","js-rejection","js-entry","react-mounted","state-config","iframe-mounted","config-received","configured").contains(step))diagnostic(step,"frontend executed");
                if("js-error".equals(step)||"js-rejection".equals(step))diagnostic("web-error",step+"; exception content omitted");
                return text("{}");
            }
            if("/__folia_rear/state".equals(path)){
                String value=state(url);org.json.JSONObject packet=new org.json.JSONObject(value);
                diagnostic("state-read","config="+packet.has("config")+", revision="+packet.optInt("revision",-1));
                if(packet.has("config"))diagnostic("state-config","configuration available via pipe");
                return text(value);
            }
            if("/__folia_rear/ready".equals(path)){diagnostic("ready-request","renderer onConfigured callback");view.post(events::ready);return text("{}");}
            if("/__folia_rear/viewport".equals(path))return text(RearLyricsViewportMetrics.snapshot());
            if("/__folia_rear/viewport-report".equals(path)){RearLyricsViewportMetrics.reportBrowser(url);return text("{}");}
            if("/__folia_rear/control".equals(path)){
                if(!"POST".equals(request.getMethod()))throw new SecurityException("POST only");
                Bundle b=new Bundle();b.putString("session",session);b.putString("action",url.getQueryParameter("action"));call("action",b);return text("{}");
            }
            if("/__folia_rear/trace".equals(path)){
                Bundle b=new Bundle();b.putString("session",session);b.putString("url",url.toString());call("trace",b);return text("{}");
            }
            java.io.InputStream stream=resource(url);
            if(path!=null&&path.endsWith(".html"))diagnostic("html-ok",path);
            if(path!=null&&path.endsWith(".js"))diagnostic("script-ok",path);
            if(path!=null&&path.endsWith(".css"))diagnostic("css-ok",path);
            return new WebResourceResponse(mime(path),"UTF-8",200,"OK",java.util.Map.of("Cache-Control","no-store","Access-Control-Allow-Origin","*"),stream);
        }catch(Exception error){
            diagnostic("web-error","path="+path+", cause="+error.getClass().getSimpleName());
            if(path!=null&&(path.endsWith(".js")||path.endsWith(".html")||path.equals("/__folia_rear/state")))
                view.post(()->events.failed("Resource unavailable path="+path+", cause="+error.getClass().getSimpleName()));
            return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    }
    private void call(String method,Bundle b){context.getContentResolver().call(Uri.parse("content://"+RearHostContract.AUTHORITY),method,null,b);}
    @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return request.isForMainFrame();}
    @Override public void onReceivedError(WebView view,WebResourceRequest request,android.webkit.WebResourceError error){if(request.isForMainFrame())events.failed("Main document unavailable code="+error.getErrorCode());}
    @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){diagnostic("web-error","HTTP="+response.getStatusCode()+", path="+request.getUrl().getPath());}
    @Override public boolean onRenderProcessGone(WebView view,android.webkit.RenderProcessGoneDetail error){events.failed("Render process gone");return true;}
    private static WebResourceResponse text(String value){return new WebResourceResponse("application/json","UTF-8",new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8)));}
    private static String mime(String path){
        if(path==null)return "application/octet-stream";
        if(path.endsWith(".js"))return "application/javascript";if(path.endsWith(".css"))return "text/css";
        if(path.endsWith(".html"))return "text/html";if(path.endsWith(".json")||path.startsWith("/__folia_rear/"))return "application/json";
        if(path.endsWith(".wasm"))return "application/wasm";
        String type=java.net.URLConnection.guessContentTypeFromName(path);return type==null?"application/octet-stream":type;
    }
}

