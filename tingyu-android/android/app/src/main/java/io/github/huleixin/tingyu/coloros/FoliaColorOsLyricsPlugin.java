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

    /** 没有在播的东西了（或者这首歌没词）：把上一段歌词撤掉。 */
    @PluginMethod
    public void clear(PluginCall call) {
        ColorOsLyricBridge.clear();
        ColorOsLyricBridge.requestRefresh(getContext());
        call.resolve();
    }
}
