package io.github.huleixin.tingyu.playback;

import java.util.Locale;

/**
 * 把「这首歌是谁」「用户选了哪个音源」「该由哪个原生解析器取地址」这三件事分开。
 *
 * <p>真机 1.3.50 的 {@code provider=qq lxSource=tx → resolver=lx-native → nativeReady=no}
 * 就是三件事被当成一件事的后果：{@code ResolverRegistry.forTrack} 只问了
 * "这个平台有没有对应的洛雪源"（{@link NativePlaylist.Track#providerId} == qq → 有 tx 源），
 * 于是无论用户在界面上选的是「洛雪自定义音源」还是「QQ 原版」，原生一律判给 lx-native。
 * 设备没装脚本时它只能回答 SCRIPT_NOT_INSTALLED → 原生不接管 → 回落给已经停止活动的
 * WebView → 当前这首播完就停。
 *
 * <p>权威在前台：{@code omni.getAudioSource} 先看 {@code useLxSourceStore.activeId}，有脚本
 * 就先问洛雪，没有（或洛雪没给出地址）才走 provider 自己的链。这里必须与它同构，否则
 * 「原生继续的下一首」和「前台会播的下一首」就不是同一条链路。
 *
 * <p>纯逻辑：不碰 Android、不碰解析器注册表、不发请求，因此可以在 JVM 上直接断言。
 */
public final class SourceRouting {

    /** 用户选的音源属于哪一类。 */
    public enum Kind {
        /** 洛雪自定义源脚本：地址来自用户导入的脚本。 */
        LX,
        /** 平台原版：地址来自 provider 自己的官方链路。 */
        ORIGINAL,
        /** 前端没说（老版本同步包 / 本地与局域网曲目）。这类沿用旧的平台启发式。 */
        UNKNOWN
    }

    /** 洛雪解析器 id，与 {@code LxNativeResolver.id()} 一致；写字符串是为了避免这条纯逻辑反向依赖解析器实现。 */
    public static final String LX_RESOLVER = "lx-native";

    private SourceRouting() { }

    /** 规范化：去空白、转小写、去掉多余空格。 */
    public static String normalize(String sourceId) {
        if (sourceId == null) return "";
        return sourceId.trim().toLowerCase(Locale.US).replace(" ", "");
    }

    /** 这个 sourceId 属于哪一类。 */
    public static Kind kindOf(String sourceId) {
        String value = normalize(sourceId);
        if (value.isEmpty()) return Kind.UNKNOWN;
        if (value.startsWith("lx:")) return Kind.LX;
        if (value.endsWith("-original") || value.startsWith("original:")) return Kind.ORIGINAL;
        return Kind.UNKNOWN;
    }

    /** 是否明确选了洛雪自定义源。 */
    public static boolean prefersLx(String sourceId) {
        return kindOf(sourceId) == Kind.LX;
    }

    /**
     * 是否明确选了平台原版。
     *
     * <p>{@code qq-original} 与 {@code original:qq} 都认；{@code providerId} 给出时还必须对得上，
     * 免得"选了原版"的结论被张冠李戴到别的平台。
     */
    public static boolean prefersOriginal(String sourceId, String providerId) {
        if (kindOf(sourceId) != Kind.ORIGINAL) return false;
        String want = normalize(providerId);
        if (want.isEmpty()) return true;
        String value = normalize(sourceId);
        if (value.startsWith("original:")) return want.equals(value.substring("original:".length()));
        return value.equals(want + "-original");
    }

    /** {@code lx:tx} 取出 platform 部分 {@code tx}；不是洛雪源返回空串。 */
    public static String lxPlatform(String sourceId) {
        String value = normalize(sourceId);
        if (!value.startsWith("lx:")) return "";
        return value.substring("lx:".length());
    }

    /**
     * 按用户的选择，这首歌应当由哪个解析器接。
     *
     * <p>返回的是**解析器 id 的期望值**，不是解析器实例，因此这条规则与注册表无关、
     * 也不需要引擎真的存在就能断言。空串表示"前端没说，交由旧的平台启发式决定"。
     */
    public static String expectedResolverId(String sourceId, String providerId) {
        Kind kind = kindOf(sourceId);
        if (kind == Kind.LX) return LX_RESOLVER;
        if (kind == Kind.ORIGINAL && prefersOriginal(sourceId, providerId)) return normalize(providerId);
        return "";
    }

    /**
     * 实际接到的解析器与用户的选择是否一致。
     *
     * <p>不一致只有两种可能：一是选了原版却落到 lx（本次修复的那个 bug）；二是反过来。
     * 两种情况都必须留痕，且**不得偷偷换解析器** —— 用户选了什么音源就用什么音源。
     */
    public static boolean matchesSelection(String sourceId, String providerId, String actualResolverId) {
        String expected = expectedResolverId(sourceId, providerId);
        if (expected.isEmpty()) return true; // 前端没说，不判错
        return expected.equals(normalize(actualResolverId));
    }

    /**
     * 选择不明时的平台启发式是否允许走洛雪。
     *
     * <p>只有"脚本真的装了且声明了这个平台"时才允许；没装就明确回落到平台原版解析器，
     * 不要再返回一个注定回答 SCRIPT_NOT_INSTALLED 的洛雪解析器把整条链堵死。
     */
    public static boolean lxInstalledFor(String providerId, boolean hasScript, String lxSourceForProvider) {
        if (!hasScript) return false;
        return lxSourceForProvider != null && !lxSourceForProvider.isEmpty();
    }

    /** 诊断用：把三元组写成一行。绝不写入任何凭据或 URL。 */
    public static String describe(String sourceId, String providerId, String actualResolverId) {
        return "source=" + (sourceId == null || sourceId.isEmpty() ? "(unset)" : sourceId)
            + ",provider=" + (providerId == null ? "" : providerId)
            + ",resolver=" + (actualResolverId == null ? "none" : actualResolverId)
            + ",expected=" + (expectedResolverId(sourceId, providerId).isEmpty() ? "(heuristic)" : expectedResolverId(sourceId, providerId));
    }
}
