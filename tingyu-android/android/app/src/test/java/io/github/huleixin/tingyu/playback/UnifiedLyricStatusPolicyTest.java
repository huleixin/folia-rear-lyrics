package io.github.huleixin.tingyu.playback;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 统一仓库的「结论性质」裁决：层级只解决谁的版本更好，解决不了「这条记录是不是一个结论」。
 *
 * <p>回归的是一个真实的次序错误：前台取词失败后按「确认无词」写了一条 stage 层级的
 * {@code none}，随后原生后台真的取到了完整时间轴（native 层级），却因为「低层级」被拒 ——
 * 这首歌从此在统一仓库里永远无词，只有再打开一次主界面才恢复。
 */
public class UnifiedLyricStatusPolicyTest {

    @Test public void aPositiveResultAlwaysBeatsAnEarlierNegativeConclusion() {
        UnifiedLyricPolicy.Decision decision = UnifiedLyricPolicy.decide(
                "none", false, "stage", "",
                "ok", false, "native", "hash-native");
        assertTrue(decision.accept);
        assertTrue(decision.reason, decision.reason.contains("positive-overrides-negative"));
    }

    @Test public void anAutomaticNegativeNeverErasesAnExistingTimeline() {
        UnifiedLyricPolicy.Decision decision = UnifiedLyricPolicy.decide(
                "ok", false, "native", "hash-native",
                "none", false, "stage", "");
        assertFalse("一个自动的「没有词」不该抹掉已经存在的时间轴", decision.accept);
        assertTrue(decision.reason, decision.reason.contains("negative-cannot-erase-timeline"));
    }

    @Test public void aUserChosenTimelineIsAlsoProtectedFromAutomaticNone() {
        UnifiedLyricPolicy.Decision decision = UnifiedLyricPolicy.decide(
                "ok", true, "stage", "hash-user",
                "none", false, "native", "");
        assertFalse(decision.accept);
    }

    @Test public void twoNegativesFallBackToTheTierRule() {
        // 都是「无词」：更高层级（舞台）可以覆盖原生结论，这没有问题。
        assertTrue(UnifiedLyricPolicy.decide("none", false, "native", "",
                "none", false, "stage", "").accept);
        assertFalse(UnifiedLyricPolicy.decide("none", false, "stage", "",
                "none", false, "native", "").accept);
    }

    @Test public void theOldSignatureKeepsTheTierBehaviour() {
        assertTrue(UnifiedLyricPolicy.decide(null, null, null, false, "native", "a").accept);
        assertFalse(UnifiedLyricPolicy.decide(false, "native", "a", false, "native", "a").accept);
    }
}
