import type { NativePageId } from '../types/nativePages';
import type { SettingsSectionId } from '../components/modal/settings/navigation/settingsNavModel';
import type { RearSettingsPage } from '../components/modal/settings/rearControlModel';

// src/services/uiLifecyclePolicy.ts
// Closed unions make adding a destination an explicit ownership decision at typecheck time.
// This records lifecycle ownership, not a claim that device rendering has been benchmarked.
type PageLifecycle = { owner:'compose-page'; retention:'route-key'; exit:'native-host' };
const page:PageLifecycle={owner:'compose-page',retention:'route-key',exit:'native-host'};
export const nativePageLifecycles:Record<NativePageId,PageLifecycle>={home:page,collection:page,search:page,settings:page};
type SettingsLifecycle='native-settings-flow'|'desktop-only'|'android-unavailable';
export const settingsSectionLifecycles:Record<SettingsSectionId,SettingsLifecycle>={
    appearance:'native-settings-flow',general:'native-settings-flow',playback:'native-settings-flow',
    interaction:'android-unavailable',integration:'native-settings-flow',storage:'native-settings-flow',
    desktop:'desktop-only',graphics:'native-settings-flow',mods:'desktop-only',lab:'android-unavailable',developer:'native-settings-flow',
};
export const rearSettingsLifecycles:Record<RearSettingsPage,'native-settings-flow'>={
    control:'native-settings-flow',advanced:'native-settings-flow',guide:'native-settings-flow',diagnostics:'native-settings-flow',
    appearance:'native-settings-flow','appearance-editor':'native-settings-flow','appearance-theme':'native-settings-flow','appearance-backup':'native-settings-flow',
};
export const overlayLifecycles={
    songMenu:{owner:'TyPanelLayer',exit:'retain-last-panel',authority:'current-session'},
    queue:{owner:'MinimalQueueSheet',exit:'AnimatedVisibility',authority:'queue-version'},
    tools:{owner:'ComposeChromeHost',exit:'retain-last-tools',authority:'current-tools-page'},
    settingsModal:{owner:'SettingsFlowPage',exit:'retain-modal',authority:'current-modal-key'},
    sleepWeb:{owner:'AppDialogs/AnimatePresence',exit:'motion-exit',authority:'presence'},
    confirmWeb:{owner:'ThemedDialog',exit:'one-explicit-presence-owner',authority:'presence'},
    librarySheetWeb:{owner:'MobileSheet',exit:'completion-before-close',authority:'once-only-close'},
    lyricMatcherWeb:{owner:'MobileLyricMatcher',exit:'static-existing-surface',authority:'modal-stack-and-busy-lock'},
} as const;
export const lifecycleExceptions={
    bottomNavigation:'Existing flowing indicator owns its animation; no page transform added.',
    foliaStage:'Live WebView retained; native entry/detour/exit clocks own container only.',
    rearAndIsland:'Independent renderers and clocks; outside front-page transitions.',
    nativeSettingsEditors:'Hidden DOM forms publish semantics; do not retain old HTML editors for exit.',
    livePreviewIslands:'Keep real WebView preview identity; never rasterize or recreate for a page transition.',
    staticControls:'No forced motion for static controls or matching forms.',
} as const;
