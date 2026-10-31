package io.github.huleixin.tingyu.resolver;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import io.github.huleixin.tingyu.playback.NativePlaylist;
import io.github.huleixin.tingyu.playback.SourceRouting;

/**
 * 解析器注册中心。
 *
 * 查找顺序是固定的：**先问能不能（supports），再问解析结果**。一个 provider 只能被一个解析器
 * 认领；没有解析器认领时返回 UNSUPPORTED 并说明原因，绝不静默返回空。
 */
public final class ResolverRegistry {

    private static final ResolverRegistry INSTANCE = new ResolverRegistry();

    private final List<SourceResolver> resolvers = new ArrayList<>();

    private ResolverRegistry() {
        // 顺序即优先级：先洛雪脚本（用户真正在用的音源），再平台原版解析器，最后是
        // 没有原生等价物的兜底说明。
        resolvers.add(new LxNativeResolver());
        resolvers.add(QqResolver.fromCredentials());
        resolvers.add(NeteaseResolver.fromCredentials());
        resolvers.add(KugouResolver.fromCredentials());
        resolvers.add(BodianResolver.fromCredentials());
        resolvers.add(QishuiResolver.fromCredentials());
        resolvers.add(new LxScriptResolver());
    }

    public static ResolverRegistry get() {
        return INSTANCE;
    }

    /** 凭据变化时刷新（例如用户在设置里改了后端地址、登录态同步）。 */
    public synchronized void refresh() {
        resolvers.clear();
        resolvers.add(new LxNativeResolver());
        resolvers.add(QqResolver.fromCredentials());
        resolvers.add(NeteaseResolver.fromCredentials());
        resolvers.add(KugouResolver.fromCredentials());
        resolvers.add(BodianResolver.fromCredentials());
        resolvers.add(QishuiResolver.fromCredentials());
        resolvers.add(new LxScriptResolver());
    }

    /**
     * 选出这个 provider 的解析器（只看 provider，不看这首歌的实际链路）。
     *
     * 仅供诊断展示使用；真正决定"谁来取地址"的是 {@link #forTrack}。
     */
    public synchronized SourceResolver forProvider(String providerId) {
        for (SourceResolver resolver : resolvers) if (resolver.supports(providerId)) return resolver;
        for (SourceResolver resolver : resolvers) {
            if (resolver instanceof LxNativeResolver && ((LxNativeResolver) resolver).canAttempt(providerId)) {
                return resolver;
            }
        }
        return null;
    }

    /**
     * 选出**这首歌**的解析器 —— 真机 1.3.48 就是在这里走错的。
     *
     * 之前的规则只有一句话：`forProvider("qq")` 先问谁 supports，而 `QqResolver.supports("qq")`
     * 恒为 true、`LxNativeResolver.supports("qq")` 在引擎没起时恒为 false（能力表为空），
     * 于是 `provider=qq lxSource=tx` 的歌永远被 QQ 匿名 musicu 认领 —— 而 musicu 今天
     * 匿名取不到地址（实测 5 首 × 5 档音质全部 `purl` 为空 / `result=104003`），
     * 结果就是后台每 1.5 秒重试一次、187 次全失败。
     *
     * 新规则：**先看这首歌的地址从哪来，再看身份。**
     * - 平台有对应洛雪源（qq→tx、netease→wy …）→ 由 lx-native 认领；脚本没装时
     *   它明确回 SCRIPT_NOT_INSTALLED，绝不悄悄改走 musicu；
     * - 只有用户自己配了可用的 QQ 自建后端、且脚本没装时，才走 QqResolver 的后端通道；
     * - 其他平台（本地、Navidrome、舞台）完全不受影响。
     */
    public synchronized SourceResolver forTrack(NativePlaylist.Track track) {
        if (track == null) return null;
        SourceRouting.Kind kind = SourceRouting.kindOf(track.sourceId);
        if (kind == SourceRouting.Kind.LX) {
            // 用户选了洛雪：只有洛雪能答。脚本没装时它明确回 SCRIPT_NOT_INSTALLED，
            // 绝不因为 provider=qq 就静默改走后台 musicu —— 那正是 1.3.50 的 bug。
            return lxResolver();
        }
        if (kind == SourceRouting.Kind.ORIGINAL && track.prefersOriginal()) {
            // 用户选了平台原版：只认这个平台自己的解析器（QQ 原版 → QqResolver）。
            // 这里必须与前台 omni.getAudioSource 在未启用脚本时走的分支一致。
            for (SourceResolver resolver : resolvers) if (resolver.supports(track.providerId)) return resolver;
            return null;
        }
        // 前端没说（老版本同步包 / 本地与局域网曲目）：沿用旧的平台启发式，行为不变。
        return heuristic(track);
    }

    private SourceResolver heuristic(NativePlaylist.Track track) {
        if (LxNativeResolver.isLxTrack(track)) {
            LxNativeResolver lx = lxResolver();
            if (lx != null && lx.canAttempt(track)) return lx;
            QqResolver withBackend = qqWithUsableBackend();
            if (withBackend != null) return withBackend;
            return lx; // 让 lx 自己说出 SCRIPT_NOT_INSTALLED，而不是静默换解析器
        }
        for (SourceResolver resolver : resolvers) if (resolver.supports(track.providerId)) return resolver;
        return null;
    }

    private LxNativeResolver lxResolver() {
        for (SourceResolver resolver : resolvers) {
            if (resolver instanceof LxNativeResolver) return (LxNativeResolver) resolver;
        }
        return null;
    }

    /** 只有在用户自建后端可用时才认领：匿名 musicu 已被证实取不到地址，不能作为静默退路。 */
    private QqResolver qqWithUsableBackend() {
        for (SourceResolver resolver : resolvers) {
            if (resolver instanceof QqResolver && ((QqResolver) resolver).backendUsable()) {
                return (QqResolver) resolver;
            }
        }
        return null;
    }

    /**
     * 解析一首歌。
     *
     * 没有解析器认领时返回 UNSUPPORTED，调用方据此回落到 JS 通道，而不是当成失败重试。
     */
    public SourceResolution resolve(NativePlaylist.Track track, String quality) {
        if (track == null) return SourceResolution.failure("no track");
        SourceResolver resolver = forTrack(track);
        if (resolver == null) {
            return SourceResolution.unsupported(
                "no native resolver for provider " + track.providerId);
        }
        try {
            return resolver.resolve(track, quality);
        } catch (Exception error) {
            String name = error.getClass().getSimpleName();
            if (name.isEmpty()) name = "unknown";
            return SourceResolution.failure("resolver " + resolver.id() + " threw " + name);
        }
    }

    /** 原生能不能不经过 WebView 拿到这首的地址。用于决定要不要走后台续播，不发请求。 */
    public boolean canResolveNatively(NativePlaylist.Track track) {
        if (track == null) return false;
        SourceResolver resolver = forTrack(track);
        if (resolver == null) return false;
        // LxScriptResolver 是"明确没有原生等价物"的说明，不是可执行解析器。
        if (resolver instanceof LxScriptResolver) return false;
        // 洛雪链路：脚本没装就别接管，让它在诊断里说出 SCRIPT_NOT_INSTALLED。
        if (resolver instanceof LxNativeResolver) return ((LxNativeResolver) resolver).canAttempt(track);
        // QQ：只有在用户自建后端可用、或 musicu 熔断未打开时才值得接管。
        if (resolver instanceof QqResolver) return ((QqResolver) resolver).canAttempt();
        // 网易云：JS 同步过 Cookie（含匿名设备 Cookie）才值得接管；没有就回落 JS 通道。
        if (resolver instanceof NeteaseResolver) return ((NeteaseResolver) resolver).canAttempt();
        // 酷狗/波点/汽水：匿名链不依赖登录态，恒可接管；登录曲目缺凭据时由各自 resolve 如实报错。
        return true;
    }

    public synchronized String describe() {
        if (resolvers.isEmpty()) return "none";
        StringBuilder text = new StringBuilder();
        for (SourceResolver resolver : resolvers) {
            if (text.length() > 0) text.append(',');
            text.append(resolver.id());
        }
        return text.toString();
    }

    /** 测试用。 */
    public synchronized void registerForTest(SourceResolver resolver) {
        resolvers.add(0, resolver);
    }

    public synchronized void resetForTest() {
        resolvers.clear();
        resolvers.add(new LxNativeResolver());
        resolvers.add(new LxScriptResolver());
    }

    /** 测试用：把 provider 名规范化，避免大小写差异。 */
    static String normalize(String providerId) {
        return providerId == null ? "" : providerId.trim().toLowerCase(Locale.US);
    }
}
