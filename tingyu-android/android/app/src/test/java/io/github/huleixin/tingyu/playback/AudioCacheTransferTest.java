package io.github.huleixin.tingyu.playback;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.concurrent.atomic.AtomicLong;
import okhttp3.MediaType;
import okhttp3.ResponseBody;
import org.junit.Test;
import static org.junit.Assert.*;

// Exercise real Okio short reads, bounded progress reporting, cancellation and size limits.
public class AudioCacheTransferTest {
    @Test(timeout=5000) public void largeAudioWithShortReadsIsNotArtificiallyThrottled() throws Exception {
        byte[] data=new byte[20*1024*1024];AtomicLong last=new AtomicLong();AtomicLong updates=new AtomicLong();
        try(ResponseBody body=ResponseBody.create(data,MediaType.get("audio/flac"))){
            long bytes=AudioCacheTransfer.drain(body.byteStream(),256L*1024*1024,()->false,n->{last.set(n);updates.incrementAndGet();});
            assertEquals(data.length,bytes);assertEquals(bytes,last.get());assertTrue(updates.get()<30);
        }
    }
    @Test public void cancellationStopsTheCurrentFile() throws Exception {
        try{AudioCacheTransfer.drain(new ByteArrayInputStream(new byte[65536]),100000,()->true,n->{});fail();}
        catch(InterruptedException expected){}
    }
    @Test public void oversizedFilesAreRejected() throws Exception {
        try{AudioCacheTransfer.drain(new ByteArrayInputStream(new byte[65536]),32000,()->false,n->{});fail();}
        catch(java.io.IOException expected){assertEquals("file limit",expected.getMessage());}
    }
    @Test public void timeoutAndVerificationHaveDifferentExplanations(){
        assertNotEquals(AudioCacheTransfer.reason(new java.net.SocketTimeoutException(),"download"),AudioCacheTransfer.reason(new java.io.IOException(),"verify"));
    }
    @Test(timeout=10000) public void realHttpStreamLargerThanOldTimeoutThresholdCompletes() throws Exception {
        byte[] audio=new byte[20*1024*1024];
        try(java.net.ServerSocket server=new java.net.ServerSocket(0,1,java.net.InetAddress.getByName("127.0.0.1"))){
            Thread producer=new Thread(()->{try(java.net.Socket socket=server.accept()){
                java.io.BufferedReader request=new java.io.BufferedReader(new java.io.InputStreamReader(socket.getInputStream()));
                for(String line;(line=request.readLine())!=null&&!line.isEmpty();){}
                java.io.OutputStream out=socket.getOutputStream();out.write(("HTTP/1.1 200 OK\r\nContent-Length: "+audio.length+"\r\nConnection: close\r\n\r\n").getBytes(java.nio.charset.StandardCharsets.US_ASCII));out.write(audio);out.flush();
            }catch(Exception ignored){}});producer.setDaemon(true);producer.start();
            okhttp3.OkHttpClient client=new okhttp3.OkHttpClient.Builder().callTimeout(3,java.util.concurrent.TimeUnit.SECONDS).build();
            try(okhttp3.Response response=client.newCall(new okhttp3.Request.Builder().url("http://127.0.0.1:"+server.getLocalPort()+"/fixture").build()).execute()){
                assertEquals(audio.length,AudioCacheTransfer.drain(response.body().byteStream(),256L*1024*1024,()->false,n->{}));
            }
            producer.join(1000);client.connectionPool().evictAll();client.dispatcher().executorService().shutdown();
        }
    }

}
