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
    interface Events { void ready(); void failed(String reason); }
    private final Context context;
    private final String session;
    private final Events events;
    private final RearHostSnapshotCache cache;
    void invalidate(){cache.invalidate();}
    private String readState(int revision)throws Exception{
        Uri read=Uri.parse("https://rear.folia.local/__folia_rear/state").buildUpon().appendQueryParameter("revision",String.valueOf(revision)).build();
        try(java.io.InputStream input=resource(read);java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream()){
            byte[] buffer=new byte[16384];int count;while((count=input.read(buffer))!=-1)bytes.write(buffer,0,count);
            return bytes.toString(StandardCharsets.UTF_8.name());
        }
    }
    private String state(Uri url)throws Exception{
        int requested=-1;try{requested=Integer.parseInt(url.getQueryParameter("revision"));}catch(Exception ignored){}
        return cache.get(requested,android.os.SystemClock.elapsedRealtime());
    }
    private java.io.InputStream resource(Uri url)throws Exception{
        Uri pipe=new Uri.Builder().scheme("content").authority(RearHostContract.AUTHORITY).path("resource")
            .appendQueryParameter("session",session).appendQueryParameter("url",url.toString()).build();
        java.io.InputStream input=context.getContentResolver().openInputStream(pipe);if(input==null)throw new java.io.FileNotFoundException();return input;
    }
    RearHostWebClient(Context context,String session,Events events){this.context=context;this.session=session;this.events=events;cache=new RearHostSnapshotCache(this::readState);}
    @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
        Uri url=request.getUrl();String path=url.getPath();
        if(!"rear.folia.local".equals(url.getHost())){
            if(!io.github.huleixin.tingyu.playback.SharedArtworkAccess.imageRequestUrl(url.toString()))return null;
        }
        try{
            if("/__folia_rear/state".equals(path))return text(state(url));
            if("/__folia_rear/ready".equals(path)){view.post(events::ready);return text("{}");}
            if("/__folia_rear/viewport".equals(path))return text(RearLyricsViewportMetrics.snapshot());
            if("/__folia_rear/viewport-report".equals(path)){RearLyricsViewportMetrics.reportBrowser(url);return text("{}");}
            if("/__folia_rear/control".equals(path)){
                if(!"POST".equals(request.getMethod()))throw new SecurityException("POST only");
                Bundle b=new Bundle();b.putString("session",session);b.putString("action",url.getQueryParameter("action"));call("action",b);return text("{}");
            }
            if("/__folia_rear/trace".equals(path)){
                Bundle b=new Bundle();b.putString("session",session);b.putString("url",url.toString());call("trace",b);return text("{}");
            }
            return new WebResourceResponse(mime(path),"UTF-8",200,"OK",java.util.Map.of("Cache-Control","no-store","Access-Control-Allow-Origin","*"),resource(url));
        }catch(Exception error){
            if(path!=null&&(path.endsWith(".js")||path.endsWith(".html")||path.equals("/__folia_rear/state")))
                view.post(()->events.failed("Resource unavailable path="+path+", cause="+error.getClass().getSimpleName()+": "+error.getMessage()));
            return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    }
    private void call(String method,Bundle b){context.getContentResolver().call(Uri.parse("content://"+RearHostContract.AUTHORITY),method,null,b);}
    @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return request.isForMainFrame();}
    @Override public void onReceivedError(WebView view,WebResourceRequest request,android.webkit.WebResourceError error){if(request.isForMainFrame())events.failed("Main document unavailable");}
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

