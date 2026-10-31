package io.github.huleixin.tingyu.playback;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/UnifiedLyricPolicyTest.java
/**
 * 统一歌词仓库覆盖裁决的行为回归。
 *
 * <p>这些规则是「三端歌词不换版本」的骨架：
 * 舞台确认版必须能覆盖后台取词版（upgrade），后台取词版绝不能盖掉舞台版（downgrade），
 * 用户手动选定版高于一切，重复发布按内容去重。
 */
public class UnifiedLyricPolicyTest {

    private static final UnifiedLyricPolicy.Decision ACCEPT_FIRST =
            UnifiedLyricPolicy.decide(null, null, null, false, "native", "hash-a");

    @Test
    public void firstRecordIsAlwaysAccepted() {
        assertTrue(ACCEPT_FIRST.accept);
        assertEquals("first-record", ACCEPT_FIRST.reason);
        assertTrue(UnifiedLyricPolicy.decide(null, null, null, true, "stage", "hash-a").accept);
    }

    @Test
    public void stageConfirmationUpgradesNativeFetch() {
        // 后台原生先取到（native 层级），用户随后打开 App，舞台确认 → 覆盖。
        UnifiedLyricPolicy.Decision d = UnifiedLyricPolicy.decide(
                false, "native", "hash-native", false, "stage", "hash-stage");
        assertTrue(d.accept);
        assertTrue(d.reason.startsWith("upgrade-tier-1-to-2"));
    }

    @Test
    public void userChoiceBeatsStageConfirmation() {
        UnifiedLyricPolicy.Decision d = UnifiedLyricPolicy.decide(
                false, "stage", "hash-stage", true, "stage", "hash-user");
        assertTrue(d.accept);
        assertTrue(d.reason.startsWith("upgrade-tier-2-to-3"));
    }

    @Test
    public void nativeFetchCanNeverDowngradeStageVersion() {
        // 反向保护：打开主界面后后台取词再来一份，不许把舞台版本换掉。
        UnifiedLyricPolicy.Decision d = UnifiedLyricPolicy.decide(
                false, "stage", "hash-stage", false, "native", "hash-native");
        assertFalse(d.accept);
        assertTrue(d.reason.startsWith("downgrade-tier-1-below-2"));
    }

    @Test
    public void nothingOverridesUserChoice() {
        // 用户手动选定的歌词（层级 3）：舞台重发、后台重取都改不动。
        assertFalse(UnifiedLyricPolicy.decide(true, "stage", "hash-user", false, "stage", "hash-stage").accept);
        assertFalse(UnifiedLyricPolicy.decide(true, "stage", "hash-user", false, "native", "hash-native").accept);
        // 同为 userChoice 的新选择仍然允许（用户再次手动换）。
        assertTrue(UnifiedLyricPolicy.decide(true, "stage", "hash-user", true, "stage", "hash-user-2").accept);
    }

    @Test
    public void identicalPayloadIsDeduplicated() {
        // 打开主界面时舞台重推同一份内容：哈希相同 → 丢弃，不触发 metadata 重建。
        UnifiedLyricPolicy.Decision d = UnifiedLyricPolicy.decide(
                false, "stage", "abc", false, "stage", "abc");
        assertFalse(d.accept);
        assertEquals("identical-hash", d.reason);
    }

    @Test
    public void sameTierUpdateWithDifferentHashIsAccepted() {
        UnifiedLyricPolicy.Decision d = UnifiedLyricPolicy.decide(
                false, "stage", "abc", false, "stage", "def");
        assertTrue(d.accept);
        assertEquals("same-tier-refresh", d.reason);
    }

    @Test
    public void tierOfMapsSourcesCorrectly() {
        assertEquals(UnifiedLyricPolicy.TIER_USER, UnifiedLyricPolicy.tierOf(true, "native"));
        assertEquals(UnifiedLyricPolicy.TIER_STAGE, UnifiedLyricPolicy.tierOf(false, "stage"));
        assertEquals(UnifiedLyricPolicy.TIER_NATIVE, UnifiedLyricPolicy.tierOf(false, "native"));
        assertEquals(UnifiedLyricPolicy.TIER_NATIVE, UnifiedLyricPolicy.tierOf(false, "unknown"));
    }
}
