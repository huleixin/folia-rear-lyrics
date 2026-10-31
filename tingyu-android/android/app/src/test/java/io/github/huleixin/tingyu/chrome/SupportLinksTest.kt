package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/SupportLinksTest.kt
// The support sheets must never jump into a wrong QQ group: an unconfigured or
// non-numeric id yields no join URI at all, and the sheet copy parser degrades
// to the Chinese fallback instead of throwing.
class SupportLinksTest {
    @Test fun unconfiguredGroupYieldsNoJoinUri() {
        assertNull(SupportLinks.groupJoinUri(""))
        assertNull(SupportLinks.groupJoinUri("   "))
        assertNull(SupportLinks.groupJoinUri("未配置"))
    }

    @Test fun joinUriKeepsOnlyDigitsAndEncodesTheGroupCardContract() {
        val uri = SupportLinks.groupJoinUri(" 123 456789 ")!!
        assertTrue(uri.startsWith("mqqapi://card/show_pslcard?"))
        assertTrue(uri.contains("uin=123456789"))
        assertTrue(uri.contains("card_type=group"))
        assertFalse(uri.contains(" "))
    }

    @Test fun normalizingPastedLabelsKeepsThePlainNumber() {
        assertEquals("123456789", SupportLinks.normalizeGroupId("群号：123456789"))
        assertEquals("", SupportLinks.normalizeGroupId("群号："))
    }

    @Test fun sheetCopyParserFallsBackInsteadOfThrowing() {
        val fallback = parseSupportCopy(null)
        assertEquals("请作者喝杯咖啡", fallback.coffeeTitle)
        assertEquals("一键加入 QQ 群", fallback.joinGroup)
        assertEquals(fallback, parseSupportCopy("not json at all"))
        val parsed = parseSupportCopy("""{"coffeeTitle":"Buy a coffee","qrMissing":"coming soon"}""")
        assertEquals("Buy a coffee", parsed.coffeeTitle)
        assertEquals("coming soon", parsed.qrMissing)
        assertEquals(fallback.joinFallback, parsed.joinFallback)
    }
}
