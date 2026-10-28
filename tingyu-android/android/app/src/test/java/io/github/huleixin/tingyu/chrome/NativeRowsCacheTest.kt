package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativeRowsCacheTest.kt
class NativeRowsCacheTest {
    private fun section(offset:Int)=NativePageSection("tracks","","rows",(0 until 100).map{
        NativePageItem("${offset+it}","Song ${offset+it}","","","play:${offset+it}","","",false,false)
    },"","","","","","","",false,10000,offset,"range")
    @Test fun scrollBackKeepsLoadedRowsWithoutBridgeTraffic() {
        val cache=NativeRowsCache();val first=section(0);val next=section(100)
        cache.accept(first);cache.accept(next)
        assertEquals("4",cache.get(next,4)?.id)
        assertEquals("104",cache.get(next,104)?.id)
        assertTrue(cache.request(230));assertFalse(cache.request(299))
    }
    @Test fun cacheEvictionAllowsTheOldWindowToBeRequestedAgain() {
        val cache=NativeRowsCache();assertTrue(cache.request(3))
        for(offset in 0..1400 step 100)cache.accept(section(offset))
        assertNull(cache.get(section(1400),3));assertTrue(cache.request(3))
        assertEquals("1403",cache.get(section(1400),1403)?.id)
    }
    @Test fun incomingRowsReplaceCachedMetadata() {
        val cache=NativeRowsCache();val first=section(0);cache.accept(first)
        val replacement=first.copy(items=listOf(first.items[0].copy(title="Updated")))
        cache.accept(replacement);assertEquals("Updated",cache.get(section(100),0)?.title)
    }
    @Test fun returningToAPlaylistRetainsRowsAndRetriesRetiredAdapterRequests(){
        val retention=NativeRowRetention(2);val first=retention.get("playlist:one")
        first.accept(section(300));assertTrue(first.request(500,"retired"));assertFalse(first.request(501,"retired"))
        val returned=retention.get("playlist:one");assertSame(first,returned)
        assertEquals("305",returned.get(section(0),305)?.id)
        assertTrue(returned.request(500,"new-session"))
        retention.get("playlist:two");retention.get("playlist:three")
        assertNotSame(first,retention.get("playlist:one"))
    }
}
