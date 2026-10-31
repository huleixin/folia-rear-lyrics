package io.github.huleixin.tingyu.lsp;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearHomeGuardPolicy.java
/**
 * 锁屏背屏接管拦截的纯逻辑判定。
 *
 * <p>这条接管链路的源码证据来自 REAREye 的 SubScreenBackHomeWhitelistModule：锁屏 + 系统
 * 背屏息屏开启时，背屏中心（com.xiaomi.subscreencenter）以 reason="aod" 调用自己的
 * home-to-front（日志串 "Start SubScreen Home reason " /
 * "getHomeToFrontOptions from Aod or turning off"），把 SubScreenLauncher 拉到背屏
 * Display。它不经过 DreamManagerService（v1.3.56 的 DreamGuard 因此无效）。
 *
 * <p>v1.3.57 的判定只在「显式组件名」上成立，两个漏点让它在真机上形同放行：
 * <ul>
 *   <li>背屏桌面通常以 <b>HOME 意图</b>启动，intent 里没有 component，包名解析为 null，
 *       于是永远不匹配、永远放行；</li>
 *   <li>判定完全不看<b>目标显示</b>，因此也不敢把 HOME 意图当作接管处理 —— 一旦按包名
 *       宽泛匹配，主屏桌面就会被误杀。</li>
 * </ul>
 * 现在把「目标显示」作为第一约束：只有落在<b>租约背屏</b>上的 HOME/背屏桌面启动才算接管；
 * 主屏（display 0）与其它显示的启动永远放行。目标显示解析不出来时，只拦明确识别为背屏
 * 桌面组件的启动，HOME 意图放行 —— 宁可漏拦一次（有应用侧重夺兜底），也绝不误杀主屏。
 */
final class RearHomeGuardPolicy {

    static final String REAR_CENTRE_PACKAGE = "com.xiaomi.subscreencenter";

    enum Decision { BLOCK, ALLOW }

    /**
     * Activity 启动请求判定。
     *
     * @param pkg             intent 里的显式包名；HOME 意图通常为 null
     * @param className       显式类名
     * @param homeIntent      intent 是否为 HOME（CATEGORY_HOME / ACTION_MAIN）
     * @param launchDisplay   目标显示；-1 表示无法解析
     * @param leasedDisplay   当前歌词租约所在的背屏 id
     */
    static Decision evaluateStart(String pkg, String className, boolean homeIntent,
            int launchDisplay, int leasedDisplay, boolean leaseHeld, boolean cameraRecently) {
        if (!leaseHeld || cameraRecently) return Decision.ALLOW;
        if (leasedDisplay <= 0) return Decision.ALLOW;
        boolean known = isRearHomeComponent(pkg, className);
        boolean anonymousHome = homeIntent && pkg == null; // 无组件的 HOME 由系统解析成该显示的桌面
        if (launchDisplay >= 0) {
            if (launchDisplay != leasedDisplay) return Decision.ALLOW; // 主屏（0，主屏 sleep 时以 0 报出）/其它显示一律不碰
            if (known || anonymousHome || REAR_CENTRE_PACKAGE.equals(pkg)) return Decision.BLOCK;
            return Decision.ALLOW;
        }
        // 目标显示解析不出来：只拦能确定的背屏桌面组件；HOME 意图放行（不能拿主屏桌面冒险）。
        return known ? Decision.BLOCK : Decision.ALLOW;
    }

    /**
     * 任务迁移判定：只有「把背屏中心的任务移到租约背屏」才是接管；目标显示不对或任务
     * 身份不确定时放行（不确定绝不拦）。
     */
    static Decision evaluateMove(String topPackage, int targetDisplay, int leasedDisplay,
            boolean leaseHeld, boolean cameraRecently) {
        if (!leaseHeld || leasedDisplay <= 0 || targetDisplay != leasedDisplay) return Decision.ALLOW;
        if (cameraRecently) return Decision.ALLOW;
        return REAR_CENTRE_PACKAGE.equals(topPackage) ? Decision.BLOCK : Decision.ALLOW;
    }

    /**
     * 背屏中心的「背屏桌面 / AOD」组件识别。SubScreenLauncher 的类名在 MRSS 与
     * REAREye 两个独立项目中都出现，是该 ROM 的稳定非混淆名；AOD/Doze 命名同时
     * 覆盖（bright 证实 DozeService 就是背屏 AOD 的 DreamService）。
     */
    static boolean isRearHomeComponent(String pkg, String className) {
        if (!REAR_CENTRE_PACKAGE.equals(pkg)) return false;
        if (className == null) return true; // 起点组件就是背屏中心自身：按接管处理
        String name = className.toLowerCase(java.util.Locale.ROOT);
        return name.contains("launcher") || name.contains("home")
            || name.contains("aod") || name.contains("doze");
    }
}
