import type { TFunction } from 'i18next';
import { isAndroidNativeRuntime } from '../../../../utils/platform';
import { useSettingsModalStore } from '../../../../stores/useSettingsModalStore';
import { useHomeLayoutSettingsStore } from '../../../../stores/useHomeLayoutSettingsStore';
import { usePlaybackEntryViewStore } from '../../../../stores/usePlaybackEntryViewStore';
import { useAndroidLayoutSettingsStore } from '../../../../stores/useAndroidLayoutSettingsStore';
import { hasLibrarySuiteChoice } from '../../../../library/registry';
import { isBravaisLibraryActive } from '../../../../library/app/bravaisLibraryActive';
import { createFlowBuilder, type FlowBuilder } from './flowBuilder';

// src/components/modal/settings/flow/generalFlow.ts
//
// 「通用」分区的语义化模型。
//
// Android 上这个分区**实际只渲染七组**（其余子节都包在 `!isAndroidNativeRuntime()` 里）：
//   语言 / 资料库分类可见性 / 播放进入目标 / 库套件选择 / Bravais 外观 /
//   屏幕常亮 / 手机适配
// 其中「库套件选择」与「Bravais 外观」是条件渲染：只有构建里存在多套件、
// 或当前套件就是 Bravais 时才出现。这两组带插图卡片与多级外观控件，
// 本构建器**不建模**，而是让整个分区回落测量路径（见 index.ts 的门控）——
// 宁可在那种配置下用旧路径，也不允许出现"少了一组设置"的页面。
//
// 其余五组全部是普通控件，逐字复用原 i18n key 与 store handler，行为不变。

/** 播放进入目标的取值与文案（与 PlaybackEntryViewOptions 的 OPTIONS 一致）。 */
const ENTRY_VIEW_VALUES = ['player', 'stay'] as const;

export function buildGeneralFlow(t: TFunction, title: string): FlowBuilder {
    const b = createFlowBuilder('general', title);
    const android = isAndroidNativeRuntime();

    // ---- 语言 ----
    const settings = useSettingsModalStore.getState();
    const languageOptions = [
        { value: 'system', label: t('options.appLanguageSystem') },
        { value: 'zh-CN', label: t('options.appLanguageZhCN') },
        { value: 'en', label: t('options.appLanguageEnUS') },
        { value: 'in', label: t('options.appLanguageInID') },
    ];
    b.group(t('options.languageSettings'));
    b.select(
        'general:language',
        t('options.appLanguage'),
        settings.appLanguagePreference,
        languageOptions,
        next => useSettingsModalStore.getState().handleSetAppLanguagePreference(next as never),
        { hint: t('options.appLanguageDesc') },
    );

    // ---- 资料库分类可见性 ----
    const layout = useHomeLayoutSettingsStore.getState();
    b.group(t(android ? 'mobileSettings.libraryCategories' : 'options.homeTabsVisibility'));
    b.toggle(
        'general:homeTabPlaylist', t('options.showHomeTabPlaylist'), layout.showHomeTabPlaylist,
        next => useHomeLayoutSettingsStore.getState().handleToggleHomeTabPlaylist(next),
    );
    b.toggle(
        'general:homeTabRadio', t('options.showHomeTabRadio'), layout.showHomeTabRadio,
        next => useHomeLayoutSettingsStore.getState().handleToggleHomeTabRadio(next),
    );
    b.toggle(
        'general:homeTabAlbums', t('options.showHomeTabAlbums'), layout.showHomeTabAlbums,
        next => useHomeLayoutSettingsStore.getState().handleToggleHomeTabAlbums(next),
    );
    b.toggle(
        'general:homeTabLocal', t('options.showHomeTabLocal'), layout.showHomeTabLocal,
        next => useHomeLayoutSettingsStore.getState().handleToggleHomeTabLocal(next),
    );

    // ---- 播放进入目标 ----
    // 原 UI 是两张大插图卡片；原生用同一份选项做成单选行（任务书允许的「单选」控件），
    // 文案沿用卡片标题，语义、取值与副作用完全一致。
    const entry = usePlaybackEntryViewStore.getState();
    b.group(t(android ? 'mobileSettings.playbackDestination' : 'options.playbackEntryView'));
    b.note(t(android ? 'mobileSettings.playbackDestinationDescription' : 'options.playbackEntryViewDesc'));
    b.select(
        'general:playbackEntryView',
        t(android ? 'mobileSettings.playbackDestination' : 'options.playbackEntryView'),
        entry.playbackEntryView,
        ENTRY_VIEW_VALUES.map(value => ({
            value,
            label: t(android && value === 'player' ? 'mobileSettings.enterLyricsStage' : `playbackEntryView.${value}.title`),
        })),
        next => usePlaybackEntryViewStore.getState().setPlaybackEntryView(next as never),
    );

    // ---- 屏幕常亮 ----
    const androidLayout = useAndroidLayoutSettingsStore.getState();
    b.group(t('options.keepScreenOn'));
    b.toggle(
        'general:keepScreenOn', t('options.keepScreenOn'), androidLayout.keepScreenOnEnabled,
        next => useAndroidLayoutSettingsStore.getState().setKeepScreenOnEnabled(next),
        { hint: t('options.keepScreenOnDesc') },
    );
    b.toggle(
        'general:minimalLyricsKeepOn', t('options.minimalLyricsKeepOn'), androidLayout.minimalLyricsKeepOnEnabled,
        next => useAndroidLayoutSettingsStore.getState().setMinimalLyricsKeepOnEnabled(next),
        { hint: t('options.minimalLyricsKeepOnDesc') },
    );

    // ---- 手机适配 ----
    const landscape = androidLayout.phoneFitOrientation === 'landscape';
    b.group(t('options.phoneFit'));
    b.toggle(
        'general:phoneFit', t('options.phoneFit'), androidLayout.phoneFitEnabled,
        next => useAndroidLayoutSettingsStore.getState().setPhoneFitEnabled(next),
        { hint: t('mobileSettings.phoneFitDescription') },
    );
    b.toggle(
        'general:phoneFitOrientation', t('options.orientationFit'), landscape,
        next => useAndroidLayoutSettingsStore.getState()
            .setPhoneFitOrientation(next ? 'landscape' : 'portrait'),
        { hint: t('options.orientationFitDesc') },
    );

    return b;
}

/**
 * 本分区能否安全走语义化路径。
 *
 * 两个条件组（库套件选择 / Bravais 外观）没有建模，因此它们出现时整页回落测量路径：
 * 少一组的原生页面比"多一次旧路径"更糟。
 *
 * 注意：这里不能调 hook（构建器在渲染期被直接调用）。isBravaisLibraryActive() 是
 * useIsBravaisLibraryActive 的非 hook 版本，两者共用同一个判定函数。
 */
export function canUseGeneralFlow(): boolean {
    return !hasLibrarySuiteChoice() && !isBravaisLibraryActive();
}
