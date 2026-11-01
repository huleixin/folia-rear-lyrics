package io.github.huleixin.tingyu.playback;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/AudioCacheStagingTest.java
public class AudioCacheStagingTest {
    @Rule public TemporaryFolder folder=new TemporaryFolder();
    @Test public void completeFileContainsTheOriginalBytesAndReleaseDeletesOnlyItsLease()throws Exception{
        AudioCacheStaging cache=new AudioCacheStaging(folder.newFolder());String token=cache.begin(65536+20000);
        byte[] a=new byte[65536],b=new byte[20000];java.util.Arrays.fill(a,(byte)13);java.util.Arrays.fill(b,(byte)42);
        cache.append(token,0,a);cache.append(token,a.length,b);File file=cache.finish(token);
        byte[] bytes=Files.readAllBytes(file.toPath());assertEquals(85536,bytes.length);assertEquals(13,bytes[0]);assertEquals(42,bytes[65536]);
        cache.release("../../not-a-lease");assertTrue(file.exists());cache.release(token);assertFalse(file.exists());
    }
    @Test public void partialOutOfOrderAndOversizedChunksNeverBecomePlayable()throws Exception{
        AudioCacheStaging cache=new AudioCacheStaging(folder.newFolder());String token=cache.begin(20000);
        try{cache.finish(token);fail();}catch(IOException expected){}
        try{cache.append(token,1,new byte[100]);fail();}catch(IOException expected){}
        try{cache.append(token,0,new byte[65537]);fail();}catch(IOException expected){}
        cache.append(token,0,new byte[20000]);assertTrue(cache.finish(token).isFile());
        try{cache.append(token,20000,new byte[1]);fail();}catch(IOException expected){}
    }
    @Test public void boundedCapacityDoesNotEvictThePlayingFileAndCanBeReused()throws Exception{
        AudioCacheStaging cache=new AudioCacheStaging(folder.newFolder());String first=cache.begin(16384);cache.begin(16384);cache.begin(16384);
        try{cache.begin(16384);fail();}catch(IOException expected){}
        cache.release(first);assertNotNull(cache.begin(16384));
        try{cache.begin(AudioCacheStaging.MAX_BYTES+1);fail();}catch(IOException expected){}
    }
    @Test public void newProcessCleansScratchWithoutTouchingUnrelatedFiles()throws Exception{
        File root=folder.newFolder();AudioCacheStaging cache=new AudioCacheStaging(root);String token=cache.begin(16384);File unrelated=new File(root,"keep");assertTrue(unrelated.createNewFile());
        new AudioCacheStaging(root);assertTrue(unrelated.exists());assertFalse(new File(root,token+".part").exists());
    }
}
