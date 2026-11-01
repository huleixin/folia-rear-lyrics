package io.github.huleixin.tingyu.playback;
import org.junit.Test;
import static org.junit.Assert.*;
// android/app/src/test/java/io/github/huleixin/tingyu/playback/LyricResourceUpgradeTest.java
public class LyricResourceUpgradeTest {
 @Test public void sessionFieldsDoNotChangeLyricsVersion(){
  assertEquals(UnifiedLyricsStore.shortHash("{\"lyric\":\"hello\",\"sessionGeneration\":1}"),UnifiedLyricsStore.shortHash("{\"sessionGeneration\":42,\"lyric\":\"hello\"}"));
  assertNotEquals(UnifiedLyricsStore.shortHash("{\"lyric\":\"hello\"}"),UnifiedLyricsStore.shortHash("{\"lyric\":\"different\"}"));
 }
 @Test public void continuousBatchesHaveNoThreeRunCeiling(){
  for(int size:new int[]{30,100,396,500}){
   int done=0,runs=0;
   while(done<size){done+=Math.min(ResourceCachePolicy.BATCH_SIZE,size-done);runs++;assertEquals(1000,ResourceCachePolicy.continuationDelay(0,100));}
   assertEquals(size,done);assertTrue(runs>0);
  }
  assertEquals(30000,ResourceCachePolicy.continuationDelay(31000,1000));
 }
 @Test public void provisionalDoesNotBlockConfirmedAndManualCannotRebound(){
  assertTrue(UnifiedLyricPolicy.decide(false,"platform","a",false,"stage","b").accept);
  assertFalse(UnifiedLyricPolicy.decide(false,"stage","b",false,"platform","c").accept);
  assertFalse(UnifiedLyricPolicy.decide(true,"stage","b",false,"stage","c").accept);
  assertTrue(UnifiedLyricPolicy.decide(false,"stage","b",true,"stage","new-manual").accept);
 }
}
