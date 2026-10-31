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
     */
    @PluginMethod
    public void publish(PluginCall call) {
        String lyricInfo = call.getString("lyricInfo");
        if (lyricInfo != null && lyricInfo.length() > 200000) { call.reject("LyricInfo payload too large"); return; }
        Boolean hasTranslation = call.getBoolean("hasTranslation");
        String songKey = call.getString("songKey");
        boolean changed = ColorOsLyricBridge.setPending(
                lyricInfo,
                hasTranslation != null && hasTranslation,
                songKey);
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
        if (changed) ColorOsLyricBridge.requestRefresh(getContext());
        call.resolve();
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
