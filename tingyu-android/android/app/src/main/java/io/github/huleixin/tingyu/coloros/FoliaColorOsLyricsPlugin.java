package io.github.huleixin.tingyu.coloros;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 标准 LyricInfo 的 Web 侧入口；保留 ColorOS 历史插件名以兼容已有调用。
 *
 * 与状态栏歌词（Lyricon）同一套路：换歌时把整条时间轴交过去，播放中一句话都不说。
 * 所有 Android ROM 均可发布；消费端能力和 ColorOS 专属翻译动作另行判断。
 */
@CapacitorPlugin(name = "FoliaColorOsLyrics")
public class FoliaColorOsLyricsPlugin extends Plugin {

    /** LyricInfo 发布能力，与是否安装显示模块、ROM 是否自带消费端分开判断。 */
    @PluginMethod
    public void isSupported(PluginCall call) {
        ColorOsLyricBridge.Detection detection = ColorOsLyricBridge.detect();
        JSObject result = new JSObject();
        // LyricInfo is MediaSession metadata, independent of the display consumer or ROM.
        result.put("supported", true);
        result.put("nativeColorOs", detection.supported);
        result.put("colorOsMajor", detection.colorOsMajor);
        result.put("detail", detection.detail);
        call.resolve(result);
    }

    /**
     * 交一份歌词时间轴过来。
     *
     * `lyricInfo` 是 Web 侧按 Bridge 协议拼好的 JSON 字符串（含逐行 / 逐字 / 翻译三条 lane），
     * 原生不解析它的内容，只在 metadata 上转发 —— 契约归播放器所有。
     *
     * 同时落**统一歌词仓库**（stage 层级）：这是「歌词舞台最终确认的版本 = 全局优先版本」
     * 的落点。后台播到同一首时，原生从仓库读这一份，打开主界面重推同一份内容时
     * `setPending` 按内容去重 —— 三端不再换版本。
     */
    @PluginMethod
    public void publish(PluginCall call) {
        String lyricInfo = call.getString("lyricInfo");
        if (lyricInfo != null && lyricInfo.length() > 200000) { call.reject("LyricInfo payload too large"); return; }
        Boolean hasTranslation = call.getBoolean("hasTranslation");
        Boolean hasWordByWord = call.getBoolean("hasWordByWord");
        Boolean userChoice = call.getBoolean("userChoice");
        String sourceId = call.getString("source");
        String songKey = call.getString("songKey");
        boolean changed = ColorOsLyricBridge.setPending(
                lyricInfo,
                hasTranslation != null && hasTranslation,
                songKey);
        // 统一仓库写 stage 层级记录。异步落盘，不阻塞发布。
        // 只在真的带着时间轴来时落库：空 payload 不构成「确认无词」，走 clear 语义。
        if (songKey != null && !songKey.isEmpty() && lyricInfo != null && !lyricInfo.isEmpty()) {
            io.github.huleixin.tingyu.playback.UnifiedLyricsStore store =
                    io.github.huleixin.tingyu.playback.UnifiedLyricsStore.get(getContext());
            store.put(songKey, "ok", lyricInfo, hasTranslation != null && hasTranslation,
                    hasWordByWord != null && hasWordByWord,
                    sourceId == null || sourceId.isEmpty() ? "stage" : sourceId,
                    "stage", userChoice != null && userChoice,
                    io.github.huleixin.tingyu.playback.LyricVariantConverter.currentRule(getContext()).id);
        }
        if (changed) ColorOsLyricBridge.requestRefresh(getContext());
        JSObject result = new JSObject();
        result.put("ok", lyricInfo != null && !lyricInfo.isEmpty());
        call.resolve(result);
    }

    /**
     * 撤掉歌词。
     *
     * 带 songKey = 「这首歌确认没有词」（只影响这一首，metadata 会明确写 noLyric）；
     * 不带 = 「整条通道作废」（停止播放）。绝不能因为换歌就整条清空 —— 那样已经预取好的
     * 下一首会被一起丢掉，灵动岛在后台就再也补不回来。
     */
    @PluginMethod
    public void clear(PluginCall call) {
        String songKey = call.getString("songKey");
        boolean changed = songKey == null || songKey.isEmpty()
                ? ColorOsLyricBridge.clear()
                : ColorOsLyricBridge.clearSong(songKey);
        // 前台加载完成确认「这首没词」时落一条 stage 层级 none 记录：
        // 后台取词链据此不再重复联网；层级裁决保证它顶不掉已有的有效歌词（用户选定版）。
        if (songKey != null && !songKey.isEmpty()) {
            io.github.huleixin.tingyu.playback.UnifiedLyricsStore.get(getContext())
                    .put(songKey, "none", null, false, false, "stage", "stage", false,
                            io.github.huleixin.tingyu.playback.LyricVariantConverter.currentRule(getContext()).id);
        }
        if (changed) ColorOsLyricBridge.requestRefresh(getContext());
        call.resolve();
    }

    /**
     * 用户在软件内手动选定歌词（歌词匹配 / 手动导入）后调用：
     * 把这首歌的统一仓库记录升级为 userChoice 层级 —— 任何自动链路从此不得覆盖。
     */
    @PluginMethod
    public void markUserChoice(PluginCall call) {
        String songKey = call.getString("songKey");
        boolean changed = io.github.huleixin.tingyu.playback.UnifiedLyricsStore.get(getContext())
                .markUserChoice(songKey == null ? "" : songKey,
                        io.github.huleixin.tingyu.playback.LyricVariantConverter.currentRule(getContext()).id);
        JSObject result = new JSObject();
        result.put("ok", changed);
        call.resolve(result);
    }

    /**
     * Web 侧同步统一简繁规则（off / t2s）。规则变了由 Web 触发歌词重载，
     * 三端随之重新收敛到同一份转换后的文本。
     */
    @PluginMethod
    public void setVariantRule(PluginCall call) {
        String rule = call.getString("rule");
        boolean changed = io.github.huleixin.tingyu.playback.LyricVariantConverter
                .setRule(getContext(), rule);
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("changed", changed);
        call.resolve(result);
    }

    /** 当前歌词通道状态（诊断面板用；只有哈希后的身份，不含歌词正文）。 */
    @PluginMethod
    public void status(PluginCall call) {
        String songKey = call.getString("songKey");
        if (songKey == null || songKey.isEmpty()) {
            // 诊断报告调用 status({}) 时不带 key：过去 stateOf(null) 恒回 no-song，
            // 与 lyric-session 的 sessionActive=true/ready 自相矛盾，排查时误导。
            // 不带 key 就按播放器当前曲作答 —— 问的就是「现在这首歌的通道状态」。
            try {
                songKey = io.github.huleixin.tingyu.playback.NativeAudioEngine.currentKey();
            } catch (Throwable ignored) {
                // 无播放引擎（未初始化/进程刚起）：维持 no-song，这时的确没有歌。
            }
        }
        JSObject result = new JSObject();
        result.put("state", ColorOsLyricBridge.stateOf(songKey));
        result.put("detail", ColorOsLyricBridge.describe(songKey));
        call.resolve(result);
    }
}
