package io.github.huleixin.tingyu.playback;

import android.net.Uri;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.TransferListener;
import java.io.IOException;
import java.util.List;
import java.util.Map;

// A bounded asynchronous tee wraps the existing data source without changing the Media3 engine.
final class AudioCacheDataSource implements DataSource {
    final DataSource upstream;final AudioCacheStore cache;AudioCacheStore.Sink sink;
    AudioCacheDataSource(DataSource source,AudioCacheStore store){upstream=source;cache=store;}
    static String header(Map<String,List<String>> headers,String key){for(Map.Entry<String,List<String>> e:headers.entrySet())if(e.getKey().equalsIgnoreCase(key)&&!e.getValue().isEmpty())return e.getValue().get(0);return "";}
    public long open(DataSpec spec)throws IOException{long size=upstream.open(spec);if("127.0.0.1".equals(spec.uri.getHost()))return size;try{
        Map<String,List<String>> h=upstream.getResponseHeaders();String range=header(h,"Content-Range");long total=size,start=spec.position;
        if(!range.isEmpty()){java.util.regex.Matcher m=java.util.regex.Pattern.compile("bytes ([0-9]+)-([0-9]+)/([0-9]+)").matcher(range);if(m.matches()){start=Long.parseLong(m.group(1));total=Long.parseLong(m.group(3));}else total=-1;}
        else if(start!=0)total=-1;
        if(header(h,"Content-Encoding").isEmpty()||header(h,"Content-Encoding").equals("identity"))sink=cache.open(spec.uri.toString(),start,total,header(h,"Content-Type"),header(h,"ETag")+header(h,"Last-Modified"));
    }catch(Exception ignored){}return size;}
    public int read(byte[] b,int o,int n)throws IOException{int count=upstream.read(b,o,n);if(count>0&&sink!=null)sink.write(b,o,count);return count;}
    public void close()throws IOException{try{upstream.close();}finally{if(sink!=null)sink.close();sink=null;}}
    public Uri getUri(){return upstream.getUri();}
    public Map<String,List<String>> getResponseHeaders(){return upstream.getResponseHeaders();}
    public void addTransferListener(TransferListener listener){upstream.addTransferListener(listener);}
}
