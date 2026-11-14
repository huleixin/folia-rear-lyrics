package io.github.huleixin.tingyu.playback;

import java.util.ArrayList;
import java.util.List;

// Ranges belong to one immutable URL/validator/length representation, never to a logical song alone.
public final class AudioRangeCoverage {
    private final List<long[]> ranges=new ArrayList<>();
    public synchronized void add(long start,long end){
        if(start<0||end<=start)return;
        int i=0;while(i<ranges.size()&&ranges.get(i)[1]<start)i++;
        while(i<ranges.size()&&ranges.get(i)[0]<=end){long[] old=ranges.remove(i);start=Math.min(start,old[0]);end=Math.max(end,old[1]);}
        ranges.add(i,new long[]{start,end});
    }
    public synchronized boolean complete(long size){return size>0&&ranges.size()==1&&ranges.get(0)[0]==0&&ranges.get(0)[1]==size;}
}
