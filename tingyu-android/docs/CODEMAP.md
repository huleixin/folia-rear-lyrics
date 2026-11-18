# 代码地图

<!-- 这份文件由 `npm run codemap` 生成，不要手改。CI 会重新生成并比对。 -->

全部内容由 TypeScript 编译器和模块图推导，不是人工维护的清单。
想知道某个具体符号在哪，用 `node dev/mcp/ts-code-map/cli.mjs search '{"query":"..."}'`。

文件里所有的量都只给**数量级**（向下取整到 2 的幂，写作 `512+`），排序也按量级。
这是有意的：精确计数会让每个新文件、每条 import 都产生一次同步提交，而那些提交
没有一条说明结构变了。要精确数字就问 `cli.mjs`，它是按需查询、不进版本库的。

## 区域分布

| 区域 | 文件数量级 |
| --- | --- |
| components | 1024+ |
| test/dev | 1024+ |
| services | 256+ |
| hooks | 128+ |
| library | 128+ |
| utils | 128+ |
| src (其他) | 64+ |
| 其他 | 64+ |
| stores | 32+ |
| types | 16+ |
| backend/electron | 8+ |
| i18n | 8+ |
| workers | 2+ |

## 枢纽模块

被 32 个以上模块依赖的文件。改动它们波及面最大，读代码时也最值得先看。

| 被依赖量级 | 模块 |
| --- | --- |
| 1024+ | `src/types.ts` |
| 128+ | `src/stores/usePlaybackStore.ts` |
| 128+ | `src/types/onlineMusic.ts` |
| 128+ | `src/utils/appPlaybackGuards.ts` |
| 64+ | `src/components/command-palette/types.ts` |
| 64+ | `src/components/visualizer/colorMix.ts` |
| 64+ | `src/services/db.ts` |
| 64+ | `src/services/onlineMusic/omni.ts` |
| 64+ | `src/stores/useAppViewStore.ts` |
| 64+ | `src/stores/useAudioSettingsStore.ts` |
| 64+ | `src/stores/useSettingsModalStore.ts` |
| 64+ | `src/stores/useStatusMessageStore.ts` |
| 64+ | `test/component/fixtures.ts` |
| 32+ | `dev/probes/definition.ts` |
| 32+ | `src/components/visualizer/definition.ts` |
| 32+ | `src/components/visualizer/hanabi/types.ts` |
| 32+ | `src/components/visualizer/tempera/types.ts` |
| 32+ | `src/components/visualizer/tuningRegistry.ts` |
| 32+ | `src/i18n/config.ts` |
| 32+ | `src/library/core/contracts/collection.ts` |
| 32+ | `src/library/core/contracts/homeModel.ts` |
| 32+ | `src/library/core/contracts/suite.ts` |
| 32+ | `src/mods/folium/contract.ts` |
| 32+ | `src/platform/runtime.ts` |
| 32+ | `src/services/nativeChrome.ts` |
| 32+ | `src/services/nativePages.ts` |
| 32+ | `src/services/onlineMusic/songMetadata.ts` |
| 32+ | `src/stores/motionSignals.ts` |
| 32+ | `src/stores/useLxSourceStore.ts` |
| 32+ | `src/stores/useOnlineProviderAccountStore.ts` |
| 32+ | `src/stores/useSearchNavigationStore.ts` |
| 32+ | `src/stores/useThemeSettingsStore.ts` |
| 32+ | `src/stores/useVisualizerSettingsStore.ts` |
| 32+ | `src/types/localLibrary.ts` |
| 32+ | `src/types/nativePages.ts` |
| 32+ | `src/types/navidrome.ts` |
| 32+ | `src/utils/fontStacks.ts` |
| 32+ | `src/utils/lyrics/graphemeTiming.ts` |
| 32+ | `src/utils/lyrics/parserCore.ts` |
| 32+ | `src/utils/lyrics/renderHints.ts` |
| 32+ | `src/utils/platform.ts` |
| 32+ | `src/utils/rearCameraSafeArea.ts` |
| 32+ | `src/utils/visualizerSurface.ts` |

## 动态注册点

这些地方用 `import.meta.glob` 自动发现成员，**清单随目录变化，不要手写**。
以下是当前的完整展开：

### `dev/probes/registry.ts`

- `dev/probes/audioEffectGrid.probe.tsx`
- `dev/probes/automixModelReminder.probe.tsx`
- `dev/probes/automixModels.probe.tsx`
- `dev/probes/automixTransitionSwitches.probe.tsx`
- `dev/probes/catalogAudioSpecs.probe.tsx`
- `dev/probes/coverSizeAudit.probe.tsx`
- `dev/probes/fmTab.probe.tsx`
- `dev/probes/foliumSelectField.probe.tsx`
- `dev/probes/globalLyricOffsetRuler.probe.tsx`
- `dev/probes/homeBehavior.probe.tsx`
- `dev/probes/icuFoliaCompare.probe.tsx`
- `dev/probes/interfaceAppearance.probe.tsx`
- `dev/probes/liquidGlass.probe.tsx`
- `dev/probes/liquidMotion.probe.tsx`
- `dev/probes/loginQrBounds.probe.tsx`
- `dev/probes/lyricFilterModal.probe.tsx`
- `dev/probes/lyricSegmentationSurface.probe.tsx`
- `dev/probes/lyricStaffSection.probe.tsx`
- `dev/probes/mobileLyricMatcher.probe.tsx`
- `dev/probes/mobileSongTools.probe.tsx`
- `dev/probes/mobileStageChrome.probe.tsx`
- `dev/probes/monetPortraitImage.probe.tsx`
- `dev/probes/monetSubtitleDualRow.probe.tsx`
- `dev/probes/nativeDragGuard.probe.tsx`
- `dev/probes/nativeLandscapeSubtitle.probe.tsx`
- `dev/probes/nowPlayingToastTransitionBorder.probe.tsx`
- `dev/probes/offlineCache.probe.tsx`
- `dev/probes/ordinaryPlaybackPower.probe.tsx`
- `dev/probes/pendoloSubtitleDualRow.probe.tsx`
- `dev/probes/playbackLyricsSettings.probe.tsx`
- `dev/probes/playerBarModButtons.probe.tsx`
- `dev/probes/playerBottomBar.probe.tsx`
- `dev/probes/providerConnect.probe.tsx`
- `dev/probes/rearControl.probe.tsx`
- `dev/probes/rearRandomRepairs.probe.tsx`
- `dev/probes/rearSettingsRepairs.probe.tsx`
- `dev/probes/rearStageSafety.probe.tsx`
- `dev/probes/resourceCache.probe.tsx`
- `dev/probes/searchSuggestions.probe.tsx`
- `dev/probes/searchWorkspace.probe.tsx`
- `dev/probes/settingsNavigation.probe.tsx`
- `dev/probes/sleepTimer.probe.tsx`
- `dev/probes/stageBackgroundSettings.probe.tsx`
- `dev/probes/stageCompatibility.probe.tsx`
- `dev/probes/subtitleDualRow.probe.tsx`
- `dev/probes/themePark.probe.tsx`
- `dev/probes/trackTitleNavigator.probe.tsx`
- `dev/probes/visualizerMemory.probe.tsx`
- `dev/probes/wallToolsIsland.probe.tsx`
- `dev/probes/wallpaperEntryConfirm.probe.tsx`

### `src/components/visualizer/backgrounds/registry.tsx`

- `src/components/visualizer/backgrounds/common/entry.tsx`
- `src/components/visualizer/backgrounds/latent/entry.tsx`
- `src/components/visualizer/backgrounds/monet/entry.tsx`
- `src/components/visualizer/backgrounds/nomand/entry.tsx`
- `src/components/visualizer/backgrounds/sora/entry.tsx`
- `src/components/visualizer/backgrounds/url/entry.tsx`

### `src/components/visualizer/registry.tsx`

- `src/components/visualizer/cadenza/entry.tsx`
- `src/components/visualizer/cappella/entry.tsx`
- `src/components/visualizer/claddagh/entry.tsx`
- `src/components/visualizer/classic/entry.tsx`
- `src/components/visualizer/diorama/entry.tsx`
- `src/components/visualizer/fume/entry.tsx`
- `src/components/visualizer/hanabi/entry.tsx`
- `src/components/visualizer/lumiere/entry.tsx`
- `src/components/visualizer/machi/entry.tsx`
- `src/components/visualizer/monet/entry.tsx`
- `src/components/visualizer/nebbia/entry.tsx`
- `src/components/visualizer/partita/entry.tsx`
- `src/components/visualizer/pendolo/entry.tsx`
- `src/components/visualizer/sonnet/entry.tsx`
- `src/components/visualizer/still/entry.tsx`
- `src/components/visualizer/tempera/entry.tsx`
- `src/components/visualizer/tilt/entry.tsx`

### `src/components/visualizer/tuningRegistry.ts`

- `src/components/visualizer/cadenza/tuning.ts`
- `src/components/visualizer/cappella/tuning.ts`
- `src/components/visualizer/claddagh/tuning.ts`
- `src/components/visualizer/classic/tuning.ts`
- `src/components/visualizer/diorama/tuning.ts`
- `src/components/visualizer/fume/tuning.ts`
- `src/components/visualizer/hanabi/tuning.ts`
- `src/components/visualizer/lumiere/tuning.ts`
- `src/components/visualizer/machi/tuning.ts`
- `src/components/visualizer/monet/tuning.ts`
- `src/components/visualizer/nebbia/tuning.ts`
- `src/components/visualizer/partita/tuning.ts`
- `src/components/visualizer/pendolo/tuning.ts`
- `src/components/visualizer/sonnet/tuning.ts`
- `src/components/visualizer/tempera/tuning.ts`
- `src/components/visualizer/tilt/tuning.ts`

### `src/library/registry.ts`

- `src/library/suites/mobile/entry.ts`

## 分层边界违规

规则是人定的（见 `codemap.mjs` 的 `BOUNDARY_RULES`），拿真实的值导入图去比对。
`import type` 不算——它在运行时不存在。

下面这些边的依赖方向本身就是错的：

- `src/components/modal/settings/PlatformAccountsPage.tsx` → `src/library/suites/mobile/native/sheetThemeTokens.ts`  —— suite 只经 registry 使用：宿主与外壳按 surface 解析，不直接 import 某套 suite
- `src/stores/useVisualizerSettingsStore.ts` → `src/components/visualizer/registry.tsx`  —— store 不应依赖组件
- `src/utils/buildDiagnosticReport.ts` → `src/hooks/useQishuiLibrary.ts`  —— 纯变换不应依赖 UI 或状态
- `src/utils/buildDiagnosticReport.ts` → `src/stores/useAudioSettingsStore.ts`  —— 纯变换不应依赖 UI 或状态
- `src/utils/buildDiagnosticReport.ts` → `src/stores/usePlaybackEngineTestStore.ts`  —— 纯变换不应依赖 UI 或状态
- `src/utils/buildDiagnosticReport.ts` → `src/stores/usePlaybackStore.ts`  —— 纯变换不应依赖 UI 或状态
- `src/utils/buildDiagnosticReport.ts` → `src/stores/useVideoLayerSettingsStore.ts`  —— 纯变换不应依赖 UI 或状态
- `src/utils/catalogAudioLabels.ts` → `src/stores/useAudioSettingsStore.ts`  —— 纯变换不应依赖 UI 或状态
- `src/utils/nativeBackPolicy.ts` → `src/stores/useAppViewStore.ts`  —— 纯变换不应依赖 UI 或状态
- `src/utils/nativeBackPolicy.ts` → `src/stores/useCollectionNavigationStore.ts`  —— 纯变换不应依赖 UI 或状态
- `src/utils/nativeBackPolicy.ts` → `src/stores/useMobileLibraryStore.ts`  —— 纯变换不应依赖 UI 或状态
- `src/utils/nativeBackPolicy.ts` → `src/stores/useSearchNavigationStore.ts`  —— 纯变换不应依赖 UI 或状态
- `src/utils/nativeBackPolicy.ts` → `src/stores/useSettingsModalStore.ts`  —— 纯变换不应依赖 UI 或状态

### 目录归属存疑

这些边命中了规则，但目标模块在运行时根本不含 UI（不传递依赖 react）。
依赖方向没问题，是文件住在了 UI 目录（`src/components/`、`src/library/` 的 suites / app）下面。修法是移动文件，不是改依赖。

- `src/services/nativeMinimalArtist.ts` → `src/components/app/search/searchCollectionAdapters.ts`
- `src/services/obs/visualSettingsConfig.ts` → `src/components/visualizer/tuningRegistry.ts`
- `src/services/playbackReady.ts` → `src/components/app/playback/restorePlaybackSource.ts`
- `src/services/ponder/pagePonderTarget.ts` → `src/components/modal/settings/navigation/settingsAnchorModel.ts`
- `src/services/sync/settingsSnapshot.ts` → `src/components/visualizer/tuningRegistry.ts`
- `src/stores/usePlaybackStore.ts` → `src/components/app/playback/createCoverUrlResolver.ts`
- `src/stores/useSettingsModalStore.ts` → `src/components/command-palette/pinnedCommandPreferences.ts`
- `src/stores/useVisualizerSettingsStore.ts` → `src/components/visualizer/hanabi/hanabiTuning.ts`
- `src/stores/useVisualizerSettingsStore.ts` → `src/components/visualizer/hanabi/types.ts`
- `src/stores/useVisualizerSettingsStore.ts` → `src/components/visualizer/machi/machiTuning.ts`
- `src/stores/useVisualizerSettingsStore.ts` → `src/components/visualizer/machi/types.ts`
- `src/stores/useVisualizerSettingsStore.ts` → `src/components/visualizer/nebbia/nebbiaTuning.ts`
- `src/stores/useVisualizerSettingsStore.ts` → `src/components/visualizer/nebbia/types.ts`
- `src/stores/visualizerSettingsPersistence.ts` → `src/components/visualizer/diorama/dioramaMoteField.ts`
- `src/stores/visualizerSettingsPersistence.ts` → `src/components/visualizer/hanabi/hanabiTuning.ts`
- `src/stores/visualizerSettingsPersistence.ts` → `src/components/visualizer/hanabi/types.ts`
- `src/stores/visualizerSettingsPersistence.ts` → `src/components/visualizer/machi/machiTuning.ts`
- `src/stores/visualizerSettingsPersistence.ts` → `src/components/visualizer/nebbia/nebbiaTuning.ts`
- `src/utils/nativeShellState.ts` → `src/components/modal/settings/navigation/settingsLastSection.ts`
- `src/utils/nativeShellState.ts` → `src/components/modal/settings/rearControlModel.ts`
- `src/utils/themeColorMath.ts` → `src/components/visualizer/colorMix.ts`

