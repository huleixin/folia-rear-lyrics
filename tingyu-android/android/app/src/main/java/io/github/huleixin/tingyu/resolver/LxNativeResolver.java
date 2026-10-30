package io.github.huleixin.tingyu.resolver;

import java.util.List;
import java.util.Locale;

import io.github.huleixin.tingyu.lx.LxOutcome;
import io.github.huleixin.tingyu.lx.LxPlatform;
import io.github.huleixin.tingyu.lx.LxRuntimeHost;
import io.github.huleixin.tingyu.playback.NativePlaylist;
import org.json.JSONObject;

/**
 * 洛雪音源的**原生**解析器 —— 这一轮真正要打通的那条链。
 *
 * 上一版的 {@link LxScriptResolver} 直接返回 UNSUPPORTED，理由成立但结论不完整：
 * "脚本是任意 JS，原生跑不了" 只否定了 WebView Worker 这一条路，并没有否定
 * "在原生里起一个 JS 引擎跑它"。用户实际复现的 `provider=qq kind=lx:tx` 走的正是
 * 洛雪脚本，所以上一版的原生链路**根本没有覆盖故障链路**。
 *
 * 这一版：脚本在 Service 进程里由 QuickJS 执行（见 {@link LxRuntimeHost}），
 * 宿主 API 按洛雪移动版协议实现。脚本没装、或没声明这个平台时仍然是 UNSUPPORTED
 * —— 那时才回落到 JS 通道，而不是假装"解析失败"。
 */
public final class LxNativeResolver implements SourceResolver {

    @Override
    public String id() {
        return "lx-native";
    }

    @Override
    public boolean supports(String providerId) {
        return LxPlatform.INSTANCE.sourceFor(providerId) != null
            && LxRuntimeHost.INSTANCE.capabilitiesFor(providerId) != null;
    }

    /**
     * 只回答"这个音源理论上能不能原生解析"，不发请求、不启引擎。
     *
     * 引擎没起来时能力表是空的，此时依然要返回 true：否则续播编排器会把它当成
     * "这个音源原生不支持"而直接放弃，而真相只是"引擎还没初始化"。
     */
    public boolean canAttempt(String providerId) {
        return LxPlatform.INSTANCE.sourceFor(providerId) != null
            && LxRuntimeHost.INSTANCE.hasScript();
    }

    public boolean canAttempt(NativePlaylist.Track track) {
        return track != null && canAttempt(track.providerId);
    }

    /**
     * 这首歌的取地址链路是不是洛雪自定义源。
     *
     * `provider=qq` 说的是**这首歌是谁**（身份），`lxSource=tx` 说的是**地址从哪来**（链路）。
     * `omni.getAudioSource` 里只要用户启用了脚本，所有在线歌曲都先走洛雪，所以这里判定的
     * 是"平台有没有对应的洛雪源"，与 provider 是不是 qq 无关。
     */
    public static boolean isLxTrack(NativePlaylist.Track track) {
        return track != null && LxPlatform.INSTANCE.sourceFor(track.providerId) != null;
    }

    @Override
    public SourceResolution resolve(NativePlaylist.Track track, String quality) {
        if (track == null) return SourceResolution.failure("no track");
        String source = LxPlatform.INSTANCE.sourceFor(track.providerId);
        if (source == null) {
            return SourceResolution.unsupported("no lx platform for provider " + track.providerId);
        }
        if (!LxRuntimeHost.INSTANCE.hasScript()) {
            // 用户没启用自定义源：这不是故障，也不是"这首歌播不了"，明确说出来，
            // 让调用方回落到 JS 通道 —— 绝不能因为 provider=qq 就静默改走 musicu。
            return SourceResolution.unsupported("SCRIPT_NOT_INSTALLED");
        }
        // prepare 会先把引擎拉起来，再给出能力表。顺序反了就永远走不到执行脚本这一步。
        List<String> qualitys = LxRuntimeHost.INSTANCE.prepare(track.providerId);
        if (qualitys == null || qualitys.isEmpty()) {
            String initError = LxRuntimeHost.INSTANCE.lastInitError();
            if (initError != null && !initError.isEmpty()) {
                return SourceResolution.failure("lx engine unavailable: " + initError);
            }
            return SourceResolution.unsupported("SOURCE_NOT_READY: no " + source + " musicUrl");
        }
        String type;
        try {
            type = LxPlatform.INSTANCE.qualityFor(quality, qualitys);
        } catch (Exception error) {
            return SourceResolution.unsupported("lx script has no usable quality for " + source);
        }
        JSONObject musicInfo = LxPlatform.INSTANCE.musicInfo(
            source, track.providerId, track.mediaId, track.title, track.artist, track.album,
            Math.max(0, track.durationMs / 1000L), track.artwork, track.providerData, qualitys);
        LxOutcome outcome = LxRuntimeHost.INSTANCE.resolve(source, type, musicInfo);
        if (outcome == null || !outcome.getOk()) {
            String reason = outcome == null ? "null outcome" : outcome.getReason();
            return SourceResolution.failure("lx " + source + ": " + reason);
        }
        String url = outcome.getValue();
        if (!isPlayable(url)) {
            return SourceResolution.failure("lx returned an unusable url");
        }
        return SourceResolution.ok(url, resolvedQuality(type), System.currentTimeMillis());
    }

    /** 与 JS validateRemoteUrl 同规则：只认公网 http(s)。 */
    static boolean isPlayable(String url) {
        if (url == null || url.isEmpty()) return false;
        String lower = url.toLowerCase(Locale.US);
        if (!lower.startsWith("https://") && !lower.startsWith("http://")) return false;
        try {
            io.github.huleixin.tingyu.lx.LxHttp.INSTANCE.validateUrl(url);
        } catch (Exception error) {
            return false;
        }
        return true;
    }

    static String resolvedQuality(String type) {
        if ("128k".equals(type)) return "standard";
        if ("flac".equals(type) || "flac24bit".equals(type)) return "lossless";
        return "high";
    }
}
