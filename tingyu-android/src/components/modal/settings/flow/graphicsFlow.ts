import type { TFunction } from 'i18next';
import { isAndroidNativeRuntime } from '../../../../utils/platform';
import { VISUALIZER_FRAME_RATE_OPTIONS } from '../../../../utils/frameRateLimiter';
import { useThemeSettingsStore } from '../../../../stores/useThemeSettingsStore';
import { usePlayerChromeSettingsStore } from '../../../../stores/usePlayerChromeSettingsStore';
import { useVisualizerSettingsStore } from '../../../../stores/useVisualizerSettingsStore';
import {
    MOTION_SURFACE_IDS,
    useMotionSettingsStore,
    type MotionSurfaceId,
} from '../../../../stores/useMotionSettingsStore';
import { createFlowBuilder, hintOf, type FlowBuilder } from './flowBuilder';

// src/components/modal/settings/flow/graphicsFlow.ts
//
// 「图形与动效」分区的语义化模型。
//
// 对照原 GraphicsSettingsSubview：Android 上真正出现的只有
// 静态模式、可视化帧率上限（开关 + 档位滑块）、以及「降低动态效果」整组；
// 首页动态背景 / 原生模糊 / Linux 光晕三个开关是桌面专属（`!isAndroidNativeRuntime()`），
// 因此这里不下发 —— 与 DOM 版的条件完全一致，不是删功能。
//
// 原生模糊的确认弹窗同样只在桌面可达，故本分区**没有弹层**：
// 这也是它适合作为首个迁移分区的原因（语义化页不承载 WebView 弹层）。

/** 「降低动态效果」每个面的文案 key，顺序即展示顺序（与 DOM 版同一份表）。 */
const SURFACE_LABEL_KEYS: Record<MotionSurfaceId, { label: string; desc: string }> = {
    lattice: { label: 'options.reduceMotionLattice', desc: 'options.reduceMotionLatticeDesc' },
    transitionOverlay: { label: 'options.reduceMotionTransitionOverlay', desc: 'options.reduceMotionTransitionOverlayDesc' },
    collectionMorph: { label: 'options.reduceMotionCollectionMorph', desc: 'options.reduceMotionCollectionMorphDesc' },
    monetBackground: { label: 'options.reduceMotionMonetBackground', desc: 'options.reduceMotionMonetBackgroundDesc' },
    uiMicroMotion: { label: 'options.reduceMotionUiMicroMotion', desc: 'options.reduceMotionUiMicroMotionDesc' },
    settingsScroll: { label: 'options.reduceMotionSettingsScroll', desc: 'options.reduceMotionSettingsScrollDesc' },
};

/** Android 上真正生效的三个面（其余是桌面/舞台专属，DOM 版同样过滤掉）。 */
const ANDROID_SURFACES: MotionSurfaceId[] = ['monetBackground', 'uiMicroMotion', 'settingsScroll'];

export function buildGraphicsFlow(t: TFunction, title: string): FlowBuilder {
    const b = createFlowBuilder('graphics', title);
    const android = isAndroidNativeRuntime();

    // ---- 性能 ----
    const themeSettings = useThemeSettingsStore.getState();
    b.group(t('options.labPerformanceSection'));
    b.toggle(
        'graphics:staticMode',
        t(android ? 'mobileSettings.staticModeTitle' : 'options.enableStaticMode'),
        themeSettings.staticMode,
        next => useThemeSettingsStore.getState().handleToggleStaticMode(next),
        { hint: hintOf(t('options.enableStaticModeDesc'), t('options.enableStaticModeDescSub')) },
    );

    // 帧率上限：开关与档位是同一个设置的两个面（关掉开关即 'off'，打开恢复上一次的档位）。
    const visual = useVisualizerSettingsStore.getState();
    const limiterOn = visual.visualizerFrameRate !== 'off';
    const currentRate = limiterOn
        ? Number(visual.visualizerFrameRate)
        : VISUALIZER_FRAME_RATE_OPTIONS[VISUALIZER_FRAME_RATE_OPTIONS.length - 1];
    b.toggle(
        'graphics:frameRateLimiter',
        t(android ? 'mobileSettings.frameRateTitle' : 'options.visualizerFrameRate'),
        limiterOn,
        next => useVisualizerSettingsStore.getState()
            .handleSetVisualizerFrameRate(next ? (currentRate as never) : 'off'),
        { hint: t(android ? 'mobileSettings.frameRateDescription' : 'options.visualizerFrameRateDesc') },
    );
    b.slider(
        'graphics:frameRate',
        t('options.visualizerFrameRateValue'),
        currentRate,
        VISUALIZER_FRAME_RATE_OPTIONS[0],
        VISUALIZER_FRAME_RATE_OPTIONS[VISUALIZER_FRAME_RATE_OPTIONS.length - 1],
        30,
        ' FPS',
        next => useVisualizerSettingsStore.getState().handleSetVisualizerFrameRate(next as never),
        { disabled: !limiterOn },
    );

    if (!android) {
        // 桌面专属三行：与 DOM 版条件一致，Android 不下发。
        b.toggle(
            'graphics:homeDynamicBackground',
            t('options.disableHomeDynamicBackground'),
            themeSettings.disableHomeDynamicBackground,
            next => useThemeSettingsStore.getState().handleToggleDisableHomeDynamicBackground(next),
            { hint: hintOf(t('options.disableHomeDynamicBackgroundDesc'), t('options.disableHomeDynamicBackgroundWarning')) },
        );
        const chromeSettings = usePlayerChromeSettingsStore.getState();
        b.toggle(
            'graphics:playerNativeBlur',
            t('options.enablePlayerPageNativeBlur'),
            chromeSettings.enablePlayerPageNativeBlur,
            next => usePlayerChromeSettingsStore.getState().handleTogglePlayerPageNativeBlur(next),
            { hint: t('options.enablePlayerPageNativeBlurDesc') },
        );
        b.toggle(
            'graphics:glowBlurQuantize',
            t('options.glowBlurQuantize'),
            visual.glowBlurQuantize,
            next => useVisualizerSettingsStore.getState().handleToggleGlowBlurQuantize(next),
            { hint: t('options.glowBlurQuantizeDesc') },
        );
    }

    // ---- 降低动态效果 ----
    const motion = useMotionSettingsStore.getState();
    const forcedBySystem = motion.followSystemReducedMotion && motion.systemPrefersReducedMotion;
    b.group(t('options.reduceMotionSection'));
    b.note(t('options.reduceMotionSectionDesc'));
    b.toggle(
        'graphics:followSystemMotion',
        t('options.reduceMotionFollowSystem'),
        motion.followSystemReducedMotion,
        next => useMotionSettingsStore.getState().handleToggleFollowSystemReducedMotion(next),
        { hint: t('options.reduceMotionFollowSystemDesc') },
    );
    const surfaces = android
        ? ANDROID_SURFACES
        : MOTION_SURFACE_IDS;
    surfaces.forEach(surface => {
        const keys = SURFACE_LABEL_KEYS[surface];
        b.toggle(
            `graphics:surface:${surface}`,
            t(keys.label),
            Boolean(motion.reducedMotionSurfaces[surface]) || forcedBySystem,
            next => useMotionSettingsStore.getState().handleToggleReducedMotionSurface(surface, next),
            {
                // 跟随系统且系统要求降级时，单项被压住：显示实际开启状态并禁用。
                hint: hintOf(
                    t(android && surface === 'uiMicroMotion' ? 'mobileSettings.microMotionDescription' : keys.desc),
                    forcedBySystem ? t('options.reduceMotionForcedBySystem') : undefined,
                ),
                disabled: forcedBySystem,
            },
        );
    });

    return b;
}
