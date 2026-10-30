package io.github.huleixin.tingyu.playback;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/QueuePrune.java
/**
 * 「一次 JS 窗口同步，该不该动当前曲后面的队列」—— 抽成纯函数，因为这条规则的真机代价是停播。
 *
 * 两条不变量：
 * <ul>
 *   <li><b>空窗口不删任何东西。</b>「这一轮一首都没解析出来」和「后面应该清空」是两件事。
 *       把它们混为一谈，就是真机 1.3.50 的 {@code queue-replenish accepted=0 removed=1}：
 *       备用域名挂掉的那个窗口，把原生已经接管、已经握着可播放地址的下一首顺手删了，
 *       当前曲播完就 queue-exhausted。</li>
 *   <li><b>已接管的项不被覆盖它的窗口带走。</b>JS 窗口项由 JS 负责，窗口换代整体替换没问题；
 *       原生接管项是已经解析完成的，一个覆盖不到它的窗口无权删除。若新窗口本身含同一首，
 *       交给「已覆盖」分支去重，不会出现两遍。</li>
 * </ul>
 */
final class QueuePrune {

    static final class Plan {
        /** 是否用新窗口替换当前曲之后的部分。false 表示完全不动队列。 */
        final boolean replace;
        /** 替换后仍要重新追加到末尾的旧项下标（已接管且新窗口未覆盖）。 */
        final List<Integer> keepIndices;

        private Plan(boolean replace, List<Integer> keepIndices) {
            this.replace = replace;
            this.keepIndices = keepIndices;
        }

        int preserveCount() {
            return keepIndices.size();
        }
    }

    private static final Plan UNTOUCHED = new Plan(false, Collections.emptyList());

    private QueuePrune() {
    }

    /**
     * @param idsAfterCurrent  当前项之后每一项的 mediaId，按队列顺序
     * @param adoptedAfterCurrent 与上一参数同长：该项是否由原生接管（地址已在手）
     * @param offered          这一轮窗口要加进来的 mediaId
     */
    static Plan plan(List<String> idsAfterCurrent, List<Boolean> adoptedAfterCurrent, Set<String> offered) {
        if (offered == null || offered.isEmpty()) return UNTOUCHED;
        List<String> ids = idsAfterCurrent == null ? Collections.emptyList() : idsAfterCurrent;
        List<Integer> keep = new ArrayList<>();
        for (int i = 0; i < ids.size(); i++) {
            boolean adopted = adoptedAfterCurrent != null
                && i < adoptedAfterCurrent.size()
                && Boolean.TRUE.equals(adoptedAfterCurrent.get(i));
            if (adopted && !offered.contains(ids.get(i))) keep.add(i);
        }
        return new Plan(true, keep);
    }
}
