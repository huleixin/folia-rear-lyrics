package io.github.huleixin.tingyu.coloros;

import android.content.Context;
import android.content.Intent;
import android.media.MediaMetadata;
import android.os.Build;
import android.util.Log;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import io.github.huleixin.tingyu.FoliaPlaybackService;

/**
 * ColorOS 原生锁屏歌词通道（对应 ColorOS-Live-Lyrics-Bridge 4.x 的「播放器主动接入」协议）。
 *
 * 协议本身很简单：播放器把自己的歌词时间轴写成一段 JSON，塞进**自己那个**
 * MediaSession 的 {@code MediaMetadata["lyricInfo"]}。ColorOS SystemUI 原生就认这个键，
 * 装上 Bridge（LSPosed 模块）之后再由它接管逐字渲染、翻译按钮与样式。
 *
 * 所以这里**不**依赖 Bridge APK、不发私有广播、也不需要 root/Xposed ——
 * 我们就是播放器本人，直接按公开契约写 metadata 即可。没装 Bridge 时 ColorOS 照样原生消费。
 *
 * 关键约束（来自 Bridge 的 PLAYER_INTEGRATION）：
 *   1. 不要另建第二个 MediaSession —— 系统可能选中错的那个，出现「暂停的重复媒体卡」。
 *   2. payload 必须属于**当前** metadata 展示的那首歌；异步回来的旧歌词不能覆盖新歌。
 *      这里靠 songKey 对齐：Web 层用与通知栏同一个 songKey（`getPlaybackSongKey`），
 *      服务只在对得上时才把它写进 metadata。
 *   3. 歌词进度**不靠**重写 metadata —— SystemUI 从 PlaybackState 取时钟。
 *      我们只在换歌 / 歌词换源时写一次。
 */
public final class ColorOsLyricBridge {

    private static final String TAG = "ColorOsLyricBridge";

    /** SystemUI 与 Bridge 认的 metadata 键。 */
    public static final String METADATA_KEY_LYRIC_INFO = "lyricInfo";

    /** Bridge 的公共「翻译」按钮。只在真的有翻译时才挂到 PlaybackState 上。 */
    public static final String ACTION_TOGGLE_TRANSLATION =
            "io.github.andrealtb.lockscreenlyrics.action.TOGGLE_TRANSLATION";

    /** 门槛：ColorOS 16 起锁屏歌词页才是当前 Bridge 开发/验证的那条路径。 */
    private static final int MIN_COLOR_OS_MAJOR = 16;

    /**
     * 读不到版本号时的兜底：ColorOS 大版本与 Android 大版本一一对应
     * （ColorOS 13↔A13、14↔A14、15↔A15、16↔A16），即 major = SDK_INT - 20。
     * 只在「认得出是 OPlus 但属性读不出来」时才用。
     */
    private static final int SDK_TO_COLOROS_OFFSET = 20;

    /**
     * 版本属性候选，按可信度排序。
     *
     * OPPO / 一加 / realme 各代 ROM 用过的键并不统一（`ro.build.version.oplusrom` 是
     * 现在最通用的一个，老机器上是 `opporom`），所以逐个试到能解析出版本为止。
     */
    private static final String[] VERSION_PROPS = {
            "ro.build.version.oplusrom",
            "ro.build.version.opporom",
            "ro.build.version.coloros",
            "ro.oplus.os.version",
            "ro.build.oplus.version",
    };

    /** OPlus 系（OPPO / 一加 / realme）的标记，打在 Build 字段或属性里。 */
    private static final String[] FAMILY_MARKERS = {"oplus", "oppo", "realme", "oneplus"};

    private ColorOsLyricBridge() {
    }

    // ---- 设备判定 ----

    public static final class Detection {
        public final boolean supported;
        /** 解析出来的 ColorOS 大版本；0 = 没读出来。 */
        public final int colorOsMajor;
        /** 判定依据，只用于日志/诊断，不参与逻辑。 */
        public final String detail;

        Detection(boolean supported, int colorOsMajor, String detail) {
            this.supported = supported;
            this.colorOsMajor = colorOsMajor;
            this.detail = detail;
        }
    }

    private static volatile Detection detection = null;

    /** 判定结果（带缓存：属性读取一次就够，别每次推歌词都去读一遍）。 */
    public static Detection detect() {
        Detection cached = detection;
        if (cached != null) {
            return cached;
        }
        Detection result = runDetection();
        detection = result;
        Log.i(TAG, "ColorOS 原生歌词通道" + (result.supported ? "开启" : "关闭")
                + "：major=" + result.colorOsMajor + "，依据=" + result.detail);
        return result;
    }

    public static boolean isSupported() {
        return detect().supported;
    }

    private static Detection runDetection() {
        String fingerprint = (Build.BRAND + " " + Build.MANUFACTURER + " " + Build.PRODUCT + " "
                + Build.DEVICE + " " + Build.MODEL + " " + Build.DISPLAY + " " + Build.FINGERPRINT)
                .toLowerCase(Locale.US);
        boolean family = false;
        for (String marker : FAMILY_MARKERS) {
            if (fingerprint.contains(marker)) {
                family = true;
                break;
            }
        }
        // Build 字段里没写（部分 realme / 一加机器如此），但只要版本属性存在就算 OPlus 系。
        if (!family) {
            for (String prop : VERSION_PROPS) {
                String raw = readProp(prop);
                if (raw != null && !raw.isEmpty()) {
                    family = true;
                    break;
                }
            }
        }
        if (!family) {
            return new Detection(false, 0, "not-an-oplus-device");
        }

        int major = 0;
        String from = "";
        for (String prop : VERSION_PROPS) {
            String raw = readProp(prop);
            int parsed = parseMajor(raw);
            if (parsed > major) {
                major = parsed;
                from = prop + "=" + raw;
            }
        }
        if (major <= 0) {
            // 有些 ROM 只在 display id 里写了 ColorOS 字样（例如 "ColorOS V16.0.1"）。
            String display = readProp("ro.build.display.id");
            if (display != null) {
                int index = display.toLowerCase(Locale.US).indexOf("coloros");
                if (index >= 0) {
                    major = parseMajor(display.substring(index + "coloros".length()));
                    from = "ro.build.display.id=" + display;
                }
            }
        }
        if (major <= 0) {
            if (Build.VERSION.SDK_INT - SDK_TO_COLOROS_OFFSET >= MIN_COLOR_OS_MAJOR) {
                return new Detection(true, Build.VERSION.SDK_INT - SDK_TO_COLOROS_OFFSET,
                        "fallback-by-api-" + Build.VERSION.SDK_INT);
            }
            return new Detection(false, 0, "coloros-version-unknown");
        }
        if (major < MIN_COLOR_OS_MAJOR) {
            return new Detection(false, major, "coloros-" + major + "-below-" + MIN_COLOR_OS_MAJOR);
        }
        return new Detection(true, major, from);
    }

    /**
     * 从形如 {@code V16.0.1} / {@code 16.0} / {@code _16} 的字符串里取开头那个整数。
     *
     * 取不到就返回 0 —— 调用方按「没读出来」处理，不会把 0 当成合法版本。
     */
    private static int parseMajor(String raw) {
        if (raw == null) {
            return 0;
        }
        int index = 0;
        while (index < raw.length() && !Character.isDigit(raw.charAt(index))) {
            index++;
        }
        if (index >= raw.length()) {
            return 0;
        }
        int end = index;
        while (end < raw.length() && Character.isDigit(raw.charAt(end))) {
            end++;
        }
        try {
            return Integer.parseInt(raw.substring(index, end));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private static String readProp(String key) {
        String value = readPropByReflection(key);
        if (value != null && !value.isEmpty()) {
            return value;
        }
        Map<String, String> props = shellProps();
        return props.get(key);
    }

    /**
     * 反射读 {@code android.os.SystemProperties.get}。
     *
     * 它是隐藏 API，部分 ROM / 高版本上会被挡掉；挡掉时返回 null，由下面那条
     * `getprop` 兜底，所以这里吞掉所有异常。
     */
    private static String readPropByReflection(String key) {
        try {
            Class<?> clazz = Class.forName("android.os.SystemProperties");
            Method get = clazz.getMethod("get", String.class);
            Object result = get.invoke(null, key);
            return result == null ? null : String.valueOf(result);
        } catch (Throwable ignored) {
            return null;
        }
    }

    /** `getprop` 的无参输出（`[key]: [value]`），一次读出全部缓存起来。 */
    private static volatile Map<String, String> shellPropsCache = null;

    private static synchronized Map<String, String> shellProps() {
        Map<String, String> cached = shellPropsCache;
        if (cached != null) {
            return cached;
        }
        Map<String, String> map = new HashMap<>();
        BufferedReader reader = null;
        try {
            Process process = new ProcessBuilder("getprop").start();
            reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            String line;
            while ((line = reader.readLine()) != null) {
                int open = line.indexOf('[');
                int close = line.lastIndexOf(']');
                if (open <= 0 || close <= open) {
                    continue;
                }
                map.put(line.substring(0, open).trim(), line.substring(open + 1, close));
            }
            process.destroy();
        } catch (Throwable error) {
            Log.w(TAG, "getprop failed; falling back to Build fields only", error);
        } finally {
            if (reader != null) {
                try {
                    reader.close();
                } catch (Throwable ignored) {
                    // 关闭失败不影响结果。
                }
            }
        }
        shellPropsCache = map;
        return map;
    }

    // ---- 歌词时间轴缓存 ----

    private static final class Payload {
        final String json;
        final boolean hasTranslation;

        Payload(String json, boolean hasTranslation) {
            this.json = json;
            this.hasTranslation = hasTranslation;
        }
    }

    /**
     * 已准备好的时间轴，按 songKey 存。
     *
     * 从「只有一个槽位」改成小容量表，是为了让**下一首**的词能提前跟原生队列一起就位：
     * Media3 自动切歌那一刻原生已经知道真正的 songKey，只要这里有它就能立刻写进 metadata，
     * 完全不必等 WebView 醒来。锁屏/灵动岛上的歌词因此不再依赖 React 是否还在跑。
     *
     * 上限 6 条（≈ 一个原生预取窗口）：歌词是整首歌的时间轴，没有理由长期留整张歌单。
     */
    private static final int MAX_CACHED_SONGS = 6;

    private static final java.util.LinkedHashMap<String, Payload> timelines =
            new java.util.LinkedHashMap<String, Payload>(8, 0.75f, true) {
                @Override protected boolean removeEldestEntry(java.util.Map.Entry<String, Payload> eldest) {
                    return size() > MAX_CACHED_SONGS;
                }
            };

    /** 明确「这首歌没有词」——与「还没拿到」必须分开，前者该清空，后者要留白等补。 */
    private static final java.util.LinkedHashMap<String, Boolean> noLyric =
            new java.util.LinkedHashMap<String, Boolean>(8, 0.75f, true) {
                @Override protected boolean removeEldestEntry(java.util.Map.Entry<String, Boolean> eldest) {
                    return size() > MAX_CACHED_SONGS;
                }
            };

    /** 没有 songKey 时的兜底槽位：老调用方（或拿不到身份的场景）仍然要能出词。 */
    private static final String UNKEYED = "*";

    private static volatile String lastRequestedKey = "";
    private static volatile long lastPublishAt = 0L;
    private static volatile int publishCount = 0;
    private static volatile int pendingCount = 0;

    private static String slot(String songKey) {
        return songKey == null || songKey.isEmpty() ? UNKEYED : songKey;
    }

    /**
     * 交一份歌词。按 songKey 入表，因此既可以交当前曲，也可以提前交下一首。
     *
     * 空 payload 表示「这首歌确认没有词」：撤掉它的时间轴并标记，metadata 才敢明确写 noLyric。
     *
     * @return 是否有变化（决定要不要让前台服务重建一次 metadata）
     */
    public static synchronized boolean setPending(String json, boolean hasTranslation, String songKey) {
        if (json != null && json.length() > 200000) throw new IllegalArgumentException("LyricInfo too large");
        String key = slot(songKey);
        lastRequestedKey = key;
        if (json == null || json.isEmpty()) {
            Payload previous = timelines.remove(key);
            Boolean marked = noLyric.put(key, Boolean.TRUE);
            return previous != null || marked == null;
        }
        noLyric.remove(key);
        Payload previous = timelines.put(key, new Payload(json, hasTranslation));
        if (previous != null && previous.json.equals(json) && previous.hasTranslation == hasTranslation) {
            return false;
        }
        publishCount++;
        lastPublishAt = System.currentTimeMillis();
        return true;
    }

    /**
     * 整条通道作废（停止播放 / 换到另一套会话）。
     *
     * 只留下来自「最后发布过的那一首」的一条空时间轴：同一次 media id 上如果直接省略 lyricInfo，
     * 部分消费端会继续显示上一段文字；明确写空的 noLyric 才是干净的收尾。
     */
    public static synchronized boolean clear() {
        String last = lastRequestedKey;
        boolean changed = !timelines.isEmpty();
        if (!changed) {
            for (String key : noLyric.keySet()) {
                if (!key.equals(last)) { changed = true; break; }
            }
        }
        timelines.clear();
        noLyric.clear();
        if (!last.isEmpty()) noLyric.put(last, Boolean.TRUE);
        return changed;
    }

    /** 只撤掉某一首：换歌时用，不要连累已经预取好的下一首。 */
    public static synchronized boolean clearSong(String songKey) {
        String key = slot(songKey);
        Payload removed = timelines.remove(key);
        Boolean marked = noLyric.put(key, Boolean.TRUE);
        return removed != null || marked == null;
    }

    /**
     * 当前这首歌能用的 {@code lyricInfo}；没有就返回 null（**不**代表这首歌没有词）。
     *
     * songKey 校验是「旧异步结果不能覆盖新歌」那条约束的落点：表按 key 存，取也按 key 取，
     * 对不上就自然拿不到上一首的词。
     */
    public static String lyricInfoFor(String songKey) {
        Payload current = timelines.get(slot(songKey));
        return current == null ? null : current.json;
    }

    /**
     * 能写进 metadata 的 {@code lyricInfo}：
     * <ul>
     *   <li>有准备好的时间轴 → 原样写；</li>
     *   <li>已确认没有词 → 写空的 noLyric 时间轴，让消费端明确收掉；</li>
     *   <li>还没拿到（后台 WebView 还没醒）→ 返回 null，调用方**不写这个字段**。</li>
     * </ul>
     * 第三条是关键：「等待补充」既不是有词也不是没词，不能用一个假的 noLyric 冒充，
     * 否则灵动岛会在换歌瞬间被我们主动清空，而真正的词随后到达也无法恢复显示。
     */
    public static String metadataLyricInfoFor(String songKey) {
        if (songKey == null || songKey.isEmpty()) return null;
        Payload current = timelines.get(slot(songKey));
        if (current != null) return current.json;
        if (noLyric.containsKey(slot(songKey))) return "{\"lyricType\":0,\"lyric\":\"\",\"noLyric\":true}";
        return null;
    }

    /** 歌词状态，只用于诊断：ready / none / pending。 */
    public static String stateOf(String songKey) {
        if (songKey == null || songKey.isEmpty()) return "no-song";
        if (timelines.containsKey(slot(songKey))) return "ready";
        if (noLyric.containsKey(slot(songKey))) return "none";
        return "pending";
    }

    /** 有没有翻译 lane —— 决定要不要挂 Bridge 的公共翻译按钮。 */
    public static boolean hasTranslationFor(String songKey) {
        if (songKey == null || songKey.isEmpty()) return false;
        Payload current = timelines.get(slot(songKey));
        return current != null && current.hasTranslation;
    }

    /**
     * 把 {@code lyricInfo} 写进 metadata。
     *
     * 注意这里只 **加** 字段：歌词是 metadata 的附加项，不是替代品，
     * 封面、时长、歌名这些一个都不能被它顶掉（协议第 7 节）。
     */
    public static void attach(MediaMetadata.Builder builder, String songKey) {
        if (builder == null) {
            return;
        }
        String json = metadataLyricInfoFor(songKey);
        if (json != null) {
            builder.putString(METADATA_KEY_LYRIC_INFO, json);
        }
    }

    /** 诊断用：缓存里有几首、当前这首是什么状态。全部只出现哈希后的身份。 */
    public static String describe(String songKey) {
        StringBuilder keys = new StringBuilder();
        for (String key : timelines.keySet()) {
            if (keys.length() > 0) keys.append(',');
            keys.append(UNKEYED.equals(key) ? "*" : hash(key));
        }
        pendingCount = lastRequestedKey.isEmpty() ? 0 : (stateOf(lastRequestedKey).equals("pending") ? 1 : 0);
        return "lyricState=" + stateOf(songKey) + ", cached=" + timelines.size() + "/" + MAX_CACHED_SONGS
            + ", noLyric=" + noLyric.size() + ", cachedKeys=[" + keys + "], publishes=" + publishCount
            + ", lastPublishAgeMs=" + (lastPublishAt == 0L ? -1L : System.currentTimeMillis() - lastPublishAt);
    }

    private static String hash(String value) {
        return Integer.toHexString(value.hashCode());
    }

    /**
     * 通知服务把 metadata/PlaybackState 用最新歌词重建一遍。
     *
     * 服务没在跑就不发 —— Android 8+ 后台起服务会被拦，而且没有 metadata 可以附加，
     * 静态 payload 会在服务下次构造 metadata 时自己带上。
     */
    public static void requestRefresh(Context context) {
        if (context == null || !FoliaPlaybackService.isRunning()) {
            return;
        }
        try {
            Intent intent = new Intent(context, FoliaPlaybackService.class);
            intent.setAction(FoliaPlaybackService.ACTION_REFRESH_METADATA);
            context.startService(intent);
        } catch (Throwable error) {
            Log.w(TAG, "refresh request failed", error);
        }
    }
}
