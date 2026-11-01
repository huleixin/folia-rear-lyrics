package io.github.huleixin.tingyu.playback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/AudioCacheStaging.java
/** Private, sequential scratch copies, not a second persistent audio cache. No caller-supplied paths. */
public final class AudioCacheStaging {
    public static final long MAX_BYTES=256L*1024*1024;
    public static final int CHUNK_BYTES=64*1024, MAX_ENTRIES=3;
    private final File directory;
    private final Map<String,Entry> entries=new HashMap<>();
    private static final class Entry {
        final File part,complete; final long expected; long written; boolean ready;
        Entry(File root,String token,long size){part=new File(root,token+".part");complete=new File(root,token+".audio");expected=size;}
    }
    public AudioCacheStaging(File directory)throws IOException {
        this.directory=directory;
        if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("Scratch directory unavailable");
        // New process only: former process has no player/FileDescriptor that can still own these files.
        File[] leftovers=directory.listFiles();if(leftovers!=null)for(File f:leftovers)if(f.getName().matches("[0-9a-f-]+\\.(part|audio)"))f.delete();
    }
    public synchronized String begin(long size)throws IOException {
        if(size<16384||size>MAX_BYTES||entries.size()>=MAX_ENTRIES)throw new IOException("Scratch capacity exceeded");
        String token=UUID.randomUUID().toString();Entry entry=new Entry(directory,token,size);
        if(!entry.part.createNewFile())throw new IOException("Scratch create failed");entries.put(token,entry);return token;
    }
    public synchronized void append(String token,long offset,byte[] bytes)throws IOException {
        Entry e=require(token);
        if(e.ready||offset!=e.written||bytes.length==0||bytes.length>CHUNK_BYTES||e.written+bytes.length>e.expected)throw new IOException("Invalid cache chunk");
        try(FileOutputStream stream=new FileOutputStream(e.part,true)){stream.write(bytes);}e.written+=bytes.length;
    }
    public synchronized File finish(String token)throws IOException {
        Entry e=require(token);if(e.ready)return e.complete;
        if(e.written!=e.expected||e.part.length()!=e.expected)throw new IOException("Incomplete cached audio");
        if(!e.part.renameTo(e.complete))throw new IOException("Cache commit failed");e.ready=true;return e.complete;
    }
    public synchronized void release(String token){Entry e=entries.remove(token);if(e!=null){e.part.delete();e.complete.delete();}}
    private Entry require(String token)throws IOException{Entry e=entries.get(token);if(e==null)throw new IOException("Unknown cache lease");return e;}
}
