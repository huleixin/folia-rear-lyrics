package io.github.huleixin.tingyu.lsp;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearDreamPolicy.java
/**
 * LSP 模式下「背屏 AOD 与听屿歌词舞台条件共存」的纯逻辑判定。
 *
 * <p>故障 B 根因（RongShangs/bright 的反编译分析证实）：系统设置里的「背屏息屏」就是
 * {@code com.xiaomi.subscreencenter.doze.DozeService} —— 一个 DreamService。主屏锁定
 * 且该开关开启时，系统把这个 Dream 启动到背屏上，Dream 窗口盖住听屿的歌词 Activity。
 * 听屿原有的三处 hook（DisplayPowerRequest 策略、shouldSleep、requestDisplayPower）
 * 只能阻止「面板断电」，挡不住「Dream 接管显示内容」——这就是关掉系统开关才能显示
 * 歌词的原因。
 *
 * <p>修复原则（对齐 bright 的细粒度思路，不扩大拦截面）：
 * <ul>
 *   <li>只针对包名精确等于背屏中心的 Dream；其他任何 Dream（主屏 AOD、防烧屏等）
 *       一律放行。</li>
 *   <li>只在听屿歌词租约真实持有期间阻止；租约不存在/过期/释放后，系统原生行为
 *       完全恢复——设置开关本身从未被改动。</li>
 *   <li>相机优先：相机刚在背屏顶上时放行 Dream，绝不与相机争夺面板。</li>
 *   <li>无法确认目标组件时一律放行（fail-transparent），并记录诊断。</li>
 * </ul>
 *
 * <p>技术边界（如实区分，不假装等价）：被阻止的是「背屏 AOD 接管」，歌词舞台仍在
 * 正常亮屏状态下运行完整动画；这不是「低功耗 AOD 歌词」。DOZE 状态的功耗特性与
 * 完整渲染不同，若厂商未来在 Dream 之外把面板压入 DOZE_SUSPEND，由既有的
 * DisplayPowerRequest POLICY_BRIGHT 租约负责维持亮屏。
 */
final class RearDreamPolicy {

    /** The OEM rear-screen centre; its DozeService is the rear AOD DreamService. */
    static final String REAR_AOD_PACKAGE = "com.xiaomi.subscreencenter";

    enum Decision { BLOCK, ALLOW }

    /**
     * @param dreamPackage   解析出的 Dream 组件包名；null/空表示无法确认
     * @param leaseHeld      听屿歌词租约此刻是否持有（背屏上有我们自己的窗口）
     * @param cameraRecently 相机是否刚出现在背屏顶上（宽限期内）
     */
    static Decision evaluate(String dreamPackage, boolean leaseHeld, boolean cameraRecently) {
        if (dreamPackage == null || dreamPackage.isEmpty()) return Decision.ALLOW;
        if (!REAR_AOD_PACKAGE.equals(dreamPackage)) return Decision.ALLOW; // Never touch other dreams.
        if (!leaseHeld) return Decision.ALLOW;   // No lyrics: native rear AOD runs untouched.
        if (cameraRecently) return Decision.ALLOW; // A camera outranks the lyrics stage.
        return Decision.BLOCK;
    }

    /** ComponentName.toString()/flattenToString() 兼容的包名提取；解析失败返回 null。 */
    static String packageNameOf(String flattened) {
        if (flattened == null || flattened.isEmpty()) return null;
        int brace = flattened.indexOf('{');
        if (brace >= 0) {
            int slash = flattened.indexOf('/', brace);
            return slash > brace + 1 ? flattened.substring(brace + 1, slash) : null;
        }
        int slash = flattened.indexOf('/');
        if (slash <= 0) return null;
        String candidate = flattened.substring(0, slash);
        return candidate.contains(".") ? candidate : null;
    }
}
