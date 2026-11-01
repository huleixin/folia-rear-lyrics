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
        io.github.huleixin.tingyu.playback.UnifiedLyricsStore store =
                io.github.huleixin.tingyu.playback.UnifiedLyricsStore.get(getContext());
        // 桥不再是版本仲裁者：写进去的必须是**统一仓库最终选定的那一版**。
        // 以前这里直接把 incoming 写进桥，于是「原生兜底版」能在仓库里明明存着舞台版的时候
        // 顶到灵动岛上 —— 岛上是逐行 LRC、背屏与舞台是另一版，三端就此分家。
        io.github.huleixin.tingyu.playback.LyricTimelineAuthority.Selection selection =
                "native-cache-display".equals(sourceId)
                ? io.github.huleixin.tingyu.playback.LyricTimelineAuthority.commitNative(store, songKey, lyricInfo,
                    hasTranslation != null && hasTranslation, sourceId,
                    io.github.huleixin.tingyu.playback.LyricVariantConverter.currentRule(getContext()).id)
                : io.github.huleixin.tingyu.playback.LyricTimelineAuthority.commitStage(
                        store, songKey, lyricInfo,
                        hasTranslation != null && hasTranslation,
                        hasWordByWord != null && hasWordByWord,
                        sourceId, userChoice != null && userChoice,
                        io.github.huleixin.tingyu.playback.LyricVariantConverter.currentRule(getContext()).id);
        store.attachRenderModel(songKey, lyricInfo, call.getString("renderModel"));
        boolean changed = selection.ready()
                ? ColorOsLyricBridge.setPending(selection.json, selection.hasTranslation, songKey,
                        selection.offsetKnown)
                : selection.state == io.github.huleixin.tingyu.playback.LyricTimelineAuthority.State.NONE
                    ? ColorOsLyricBridge.setPending(null, false, songKey)
                    // 没有 songKey（老调用方）或仓库还没有结论：这份 payload 就是唯一候选。
                    // JS 侧（1.3.67 起）发布的都是原始时间轴，偏移在交付点应用。
                    : ColorOsLyricBridge.setPending(lyricInfo, hasTranslation != null && hasTranslation, songKey);
        if (songKey != null && !songKey.isEmpty()) {
            io.github.huleixin.tingyu.playback.LyricSyncLedger.get()
                .track(songKey, io.github.huleixin.tingyu.RearNativeTrack.epoch());
            io.github.huleixin.tingyu.playback.LyricSyncLedger.get().unified(songKey, selection);
            io.github.huleixin.tingyu.playback.LyricSyncLedger.get()
                .stagePublished(songKey, selection.hash, System.currentTimeMillis());
        }
        if (changed) ColorOsLyricBridge.requestRefresh(getContext());
        JSObject result = new JSObject();
        result.put("ok", lyricInfo != null && !lyricInfo.isEmpty());
        result.put("hash", selection.hash);
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
        if (songKey == null || songKey.isEmpty()) {
            boolean changed = ColorOsLyricBridge.clear();
            if (changed) ColorOsLyricBridge.requestRefresh(getContext());
            call.resolve();
            return;
        }
        // 前台加载完成确认「这首没词」时落一条 stage 层级 none 记录：
        // 后台取词链据此不再重复联网；层级裁决保证它顶不掉已有的有效歌词（用户选定版）。
        io.github.huleixin.tingyu.playback.UnifiedLyricsStore store =
                io.github.huleixin.tingyu.playback.UnifiedLyricsStore.get(getContext());
        // 关键：仓库里如果**还有**时间轴（原生后台已经取到、或用户手动选定过），
        // 「舞台这一轮没加载出来」绝不能把灵动岛清空 —— 以前这里无条件写 noLyric，
        // 于是岛上是空的、背屏（走统一仓库）却照常显示，三端当场分家。
        io.github.huleixin.tingyu.playback.LyricTimelineAuthority.Selection selection =
                io.github.huleixin.tingyu.playback.LyricTimelineAuthority.commitNone(store, songKey,
                    "stage",
                    io.github.huleixin.tingyu.playback.LyricVariantConverter.currentRule(getContext()).id);
        boolean changed;
        if (selection.ready()) {
            changed = ColorOsLyricBridge.setPending(selection.json, selection.hasTranslation, songKey,
                    selection.offsetKnown);
        } else {
            changed = ColorOsLyricBridge.clearSong(songKey);
        }
        io.github.huleixin.tingyu.playback.LyricSyncLedger.get()
            .track(songKey, io.github.huleixin.tingyu.RearNativeTrack.epoch());
        io.github.huleixin.tingyu.playback.LyricSyncLedger.get().unified(songKey, selection);
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

    /**
     * JS 把当前生效的歌词时间轴偏移同步给原生（正 = 延后，毫秒）。
     *
     * <p>偏移的权威值只在 JS 侧（单曲手动 + 设备全局），原生兜底取词
     * （{@code SongInfoLoader}）落库前用它烘焙 —— 不带这条同步，锁屏后台由原生
     * 兜底出词时三端就不在同一时间坐标上，用户校准过的蓝牙延迟在锁屏后全部丢失。
     * {@code songKey} 为空 = 设备全局值。
     */
    @PluginMethod
    public void setLyricOffset(PluginCall call) {
        String songKey = call.getString("songKey");
        Double offset = call.getDouble("offsetMs");
        long value = offset == null ? 0L : Math.round(offset);
        long previous = songKey == null || songKey.isEmpty()
                ? io.github.huleixin.tingyu.playback.LyricTimelineOffset.global()
                : io.github.huleixin.tingyu.playback.LyricTimelineOffset.forSong(songKey);
        if (songKey == null || songKey.isEmpty()) {
            io.github.huleixin.tingyu.playback.LyricTimelineOffset.setGlobal(value);
        } else {
            io.github.huleixin.tingyu.playback.LyricTimelineOffset.set(songKey, value);
        }
        // 镜像到盘：进程重建后（WebView 还没启动）原生兜底取词仍能拿到正确偏移。
        io.github.huleixin.tingyu.playback.LyricOffsetPersistence.save(getContext());
        io.github.huleixin.tingyu.playback.LyricSyncLedger.get().offset(value);
        if (previous != value) {
            // 交付结果变了而内容没变：递增版本号让自检守卫重建 metadata（新偏移进岛），
            // 背屏行的缓存键含 revision 也会自动重建。仓库/桥里的原始时间轴不动。
            if (songKey != null && !songKey.isEmpty()) {
                ColorOsLyricBridge.bumpRevision(songKey);
                io.github.huleixin.tingyu.RearNativeLyricLines.clear();
            }
            ColorOsLyricBridge.requestRefresh(getContext());
        }
        JSObject result = new JSObject();
        result.put("ok", true);
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
        // 端到端同步账本：一次调用就能拿到「哪一环断了」的结论，不必再逐条翻日志。
        long now = System.currentTimeMillis();
        result.put("sync", io.github.huleixin.tingyu.playback.LyricSyncLedger.get().describe(now));
        result.put("verdict", io.github.huleixin.tingyu.playback.LyricSyncLedger.get()
                .verdict(now).name().toLowerCase(java.util.Locale.US));
        call.resolve(result);
    }
}
