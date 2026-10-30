package io.github.huleixin.tingyu.resolver;

import io.github.huleixin.tingyu.playback.NativePlaylist;

/**
 * 洛雪自定义音源（lx-wy / lx-tx / lx-kg / lx-kw / lx-mg）——**明确标记不支持原生独立解析**。
 *
 * 真机复现的 `kind=lx:tx` 就是这条链。核对过实现（`src/services/lxSource/playback.ts`）：
 * 地址来自 `LxRuntime` 里跑的**用户自己导入的 JS 脚本**（`runtime.worker.ts` 起的 Worker），
 * 原生侧没有任何等价物 —— 那是一段任意代码，不是可以复刻的 HTTP 协议。
 *
 * 于是这里的答案是 UNSUPPORTED，而不是"失败"：
 * - 它不会被重试，因为重试不可能让原生突然会跑 JS；
 * - 调用方收到它必须回落到原来的 JS 通道，并且**不能**把这一首记成"播不了"；
 * - 若这首歌的逻辑身份是 `qq`（洛雪只是取地址的手段），{@link QqBackendResolver} 仍可以为
 *   **同一首歌**从官方后端拿到地址 —— 那是一条真实可用的原生链路，不是洛雪的替代品，
 *   两者取到的是同一首歌的不同地址。
 */
public final class LxScriptResolver implements SourceResolver {

    @Override
    public String id() {
        return "lx-script";
    }

    @Override
    public boolean supports(String providerId) {
        return providerId != null && providerId.startsWith("lx-");
    }

    @Override
    public SourceResolution resolve(NativePlaylist.Track track, String quality) {
        return SourceResolution.unsupported(
            "LX source scripts are user-imported JavaScript and can only run inside the WebView");
    }
}
