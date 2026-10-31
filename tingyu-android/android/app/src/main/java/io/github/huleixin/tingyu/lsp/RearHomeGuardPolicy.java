package io.github.huleixin.tingyu.lsp;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearHomeGuardPolicy.java
/**
 * 锁屏背屏接管拦截的纯逻辑判定（真实接管路径的证据来自 REAREye 的
 * SubScreenBackHomeWhitelistModule 源码）：锁屏 + 系统背屏息屏开启时，
 * 背屏中心（com.xiaomi.subscreencenter）会以 reason="aod" 把自己的
 * SubScreenLauncher（背屏桌面）拉到背屏 Display——盖掉/顶掉听屿歌词任务。
 * 这条路径不经过 DreamManagerService（v1.3.56 的 DreamGuard 因此无效）。
 *
 * <p>系统 Server 侧能看到的因果上游：背屏中心的 Activity 启动请求
 * （ActivityStarter.executeRequest）与任务迁移（moveRootTaskToDisplay）。
 * 拦截判定在此处收口为纯函数，方便 JVM 断言。
 */
final class RearHomeGuardPolicy {

    static final String REAR_CENTRE_PACKAGE = "com.xiaomi.subscreencenter";

    enum Decision { BLOCK, ALLOW }

    /**
     * Activity 启动请求判定：背屏中心的背屏桌面/AOD 组件 + 歌词租约持有 + 无相机
     * → 阻止本次启动。组件解析失败一律放行。
     */
    static Decision evaluateStart(String pkg, String className, boolean leaseHeld, boolean cameraRecently) {
        if (!isRearHomeComponent(pkg, className)) return Decision.ALLOW;
        if (!leaseHeld) return Decision.ALLOW;
        if (cameraRecently) return Decision.ALLOW;
        return Decision.BLOCK;
    }

    /**
     * 任务迁移判定：比启动判定多一个约束——只有「把背屏中心的任务移到租约背屏」
     * 才是接管；目标显示不对或任务身份不确定时放行（不确定绝不拦）。
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
