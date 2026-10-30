package io.github.huleixin.tingyu.resolver;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import io.github.huleixin.tingyu.playback.NativePlaylist;

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
        // 顺序即优先级：先洛雪脚本（用户真正在用的音源），再 QQ 官方后端，最后是没有
        // 原生等价物的兜底说明。
        resolvers.add(new LxNativeResolver());
        resolvers.add(QqResolver.fromCredentials());
        resolvers.add(new LxScriptResolver());
    }

    public static ResolverRegistry get() {
        return INSTANCE;
    }

    /** 凭据变化时刷新（例如用户在设置里改了后端地址）。 */
    public synchronized void refresh() {
        resolvers.clear();
        resolvers.add(new LxNativeResolver());
        resolvers.add(QqResolver.fromCredentials());
        resolvers.add(new LxScriptResolver());
    }

    /**
     * 选出这个 provider 的解析器。
     *
     * 两轮：先问"真的支持吗"（能力表已经拿到），再问"值不值得试一次"
     * （洛雪引擎还没初始化，能力表是空的，但脚本装着 —— 此时必须让它去试，
     * 由 {@link LxNativeResolver#resolve} 自己给出 UNSUPPORTED 还是 OK）。
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
     * 解析一首歌。
     *
     * 没有解析器认领时返回 UNSUPPORTED，调用方据此回落到 JS 通道，而不是当成失败重试。
     */
    public SourceResolution resolve(NativePlaylist.Track track, String quality) {
        if (track == null) return SourceResolution.failure("no track");
        SourceResolver resolver = forProvider(track.providerId);
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
        SourceResolver resolver = forProvider(track.providerId);
        // LxScriptResolver 是"明确没有原生等价物"的说明，不是可执行解析器。
        return resolver != null && !(resolver instanceof LxScriptResolver);
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
