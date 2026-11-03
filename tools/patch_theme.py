import io

root = r"C:\Users\DELL\WorkBuddy\2026-11-04-00-12-04\repo\tingyu-android"

# ---------- 1. JS：把"这一页用深色还是浅色"作为事实随帧下发 ----------
p = root + r"\src\services\nativeMinimalPlayer.ts"
s = io.open(p, encoding="utf-8").read()
s = s.replace(
    """    /** 音效开关状态，同样是菜单里的第二行值。 */
    effectsOn: boolean;""",
    """    /** 音效开关状态，同样是菜单里的第二行值。 */
    effectsOn: boolean;
    /**
     * 这一页现在的主题（`isDaylight`）—— **和 palette 同一个来源**。
     *
     * 原生的 `InterfaceAppearance` 是"应用界面"的深浅色，和播放器主题不是一回事：
     * 两者不一致时，页面会拿到深色配色 + 浅色墨色，也就是深蓝底上的深绿字。
     */
    light: boolean;""")
io.open(p, "w", encoding="utf-8").write(s)

p = root + r"\src\hooks\useNativeMinimalPlayer.ts"
s = io.open(p, encoding="utf-8").read()
s = s.replace(
    """            effectsOn: useAudioSettingsStore.getState().audioEqualizerSettings.enabled,""",
    """            effectsOn: useAudioSettingsStore.getState().audioEqualizerSettings.enabled,
            // 和 palette 用同一个 light：页面主题只有一个来源。
            light,""")
io.open(p, "w", encoding="utf-8").write(s)

# ---------- 2. Kotlin：帧里带上 light，界面用它 ----------
p = (root + r"\android\app\src\main\java\io\github\huleixin\tingyu\minimal"
     r"\MinimalPlayerRuntime.kt")
s = io.open(p, encoding="utf-8").read()
s = s.replace(
    """    val qualityMode: String = "",
    val effectsOn: Boolean = false,
    val liked: Boolean = false,""",
    """    val qualityMode: String = "",
    val effectsOn: Boolean = false,
    /** 这一页的主题，与 [MinimalBridgeFrame.palette] 同源。 */
    val light: Boolean = false,
    val liked: Boolean = false,""")
s = s.replace(
    """                effectsOn = value.optBoolean("effectsOn", false),""",
    """                effectsOn = value.optBoolean("effectsOn", false),
                light = value.optBoolean("light", false),""")
s = s.replace(
    """            qualityMode = bridge?.qualityMode ?: "",
            effectsOn = bridge?.effectsOn == true,""",
    """            qualityMode = bridge?.qualityMode ?: "",
            effectsOn = bridge?.effectsOn == true,
            light = bridge?.light ?: false,""")
s = s.replace(
    """    /** 播放偏好里的音质档位，只出现在「更多」菜单的第二列。 */
    val qualityMode: String = "",
    val effectsOn: Boolean = false,""",
    """    /** 播放偏好里的音质档位，只出现在「更多」菜单的第二列。 */
    val qualityMode: String = "",
    val effectsOn: Boolean = false,
    /**
     * 页面主题。`null` 表示桥上还没有结论 —— 此时才退回宿主给的界面主题。
     *
     * 这两个值不是同一件事：界面可以是浅色，而这一页跟随歌曲主题是深色。
     * 上一版直接用界面主题决定墨色，于是深色背景上画了一整套浅色主题的深绿字。
     */
    val light: Boolean? = null,""")
io.open(p, "w", encoding="utf-8").write(s)

# ---------- 3. 屏幕：light 以桥为准 ----------
p = (root + r"\android\app\src\main\java\io\github\huleixin\tingyu\minimal\ui"
     r"\MinimalPlayerScreen.kt")
s = io.open(p, encoding="utf-8").read()
s = s.replace(
    """    val playback = state.playback
    val ink = remember(light) { minimalInk(light) }""",
    """    val playback = state.playback
    // 主题只有一个来源：桥上说的（和 palette 同源）。桥还没说话时才用宿主给的界面主题。
    val dark = !(state.controls.light ?: light)
    val ink = remember(dark) { minimalInk(!dark) }""")
s = s.replace(
    """    val local = remember(artwork.colors, artwork.songKey, light) {
        buildMinimalPalette(artwork.colors, light)
    }""",
    """    val local = remember(artwork.colors, artwork.songKey, dark) {
        buildMinimalPalette(artwork.colors, !dark)
    }""")
s = s.replace(
    """            colors = paletteColors(palette),
            light = light,""",
    """            colors = paletteColors(palette),
            light = !dark,""")
s = s.replace(
    """            TopBar(
                ink = ink,
                base = Color(palette.base),""",
    """            TopBar(
                ink = ink,
                base = Color(palette.base),""")
s = s.replace(
            """                        palette = palette,
                        ink = ink,
                        light = light,""",
            """                        palette = palette,
                        ink = ink,
                        light = !dark,""")
s = s.replace(
            """                        palette = palette,
                        ink = ink,
                        clock = clock,""",
            """                        palette = palette,
                        ink = ink,
                        clock = clock,""")
io.open(p, "w", encoding="utf-8").write(s)
print("light source unified")
