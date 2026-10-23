import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n/config';
import './index.css';
import './styles/androidPhoneFit.css';
import App from './App';
import AppSplashGate from './components/AppSplashGate';
import ChunkLoadBoundary from './components/app/ChunkLoadBoundary';
import { initializeLocalCoverRuntime } from './services/localCoverRuntime';
import { initFoliumClients } from './mods/folium/clientLoader';
import { restoreSavedFoliumSelections } from './mods/folium/missingEntries';
import { installFoliumCommandPaletteSync } from './mods/folium/commandPaletteSync';
import { installFoliumHostEvents } from './mods/folium/hostEvents';
import { installFoliumHomePageDismissal } from './components/app/home/foliumHomePageDismissal';
import { installLibrarySuiteChromeCommands } from './library/app/installLibrarySuiteChromeCommands';
import { installNativeDragGuard } from './utils/nativeDragGuard';
import { bootNavidromeServerPreset } from './services/navidromeServerPreset';
import { isNavidromeEnabled } from './services/navidromeService';
import { setNavidromeEnabledState } from './stores/useLibraryStore';
import { isMainAppSurface } from './utils/appSurface';
import { installPlaybackHeartbeat } from './services/playbackHeartbeat';
// 副作用 import：store 在模块加载时就把 `<html data-reduce-motion>` 写好并保持同步。放在 bootstrap
// 而不是 App 里，是因为下面按 URL 挂的根不止 App —— 远程控制窗口的进度辉光也读这个属性。
import './stores/useMotionSettingsStore';

// src/bootstrap.tsx
// Mounts the React app after index.tsx installs runtime-level browser shims.

// A mod visualizer or background saved to localStorage can only survive a
// restart if its registry entry exists before the settings store validates the
// stored mode. The store initializes eagerly through the static import graph,
// so the mode it read may already have fallen back to a builtin; after mod
// clients register their entries we restore the saved selections
// (src/mods/folium/missingEntries.ts, which also re-runs on every mod reload).

// #394: with a selection on the page, native drag-and-drop would hijack slider gestures. Installed
// here, for every surface this bundle mounts, rather than inside App so the remote-control and OBS
// roots are covered too and App.tsx does not grow. See utils/nativeDragGuard.ts.
installNativeDragGuard();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
// Mod clients belong to the main app window only. The remote-control window
// also has the Electron bridge, but mod state pushes only reach the main
// window, so a client activated there would never be torn down.
const isMainApp = isMainAppSurface;
const renderApp = () => root.render(
    <React.StrictMode>
      <ChunkLoadBoundary>
        <AppSplashGate>
          <App />
        </AppSplashGate>
      </ChunkLoadBoundary>
    </React.StrictMode>
  );

// Library suites declare their chrome actions in their manifests; the palette cannot import the
// registry, so the commands are put into its list here, before anything renders (main window only,
// like the mod commands below). A clashing execute shortcut throws here, at startup.
if (isMainApp) installLibrarySuiteChromeCommands();
if (isMainApp) installPlaybackHeartbeat();

const bootFolium = async () => {
    if (!isMainApp) return;
    installFoliumCommandPaletteSync();
    installFoliumHostEvents();
    // 显式打开集合时关掉开着的模组首页页面；与 Home 挂没挂着无关，所以在这里装（见 foliumHomePageDismissal）。
    installFoliumHomePageDismissal();
    await initFoliumClients();
    restoreSavedFoliumSelections();
};

// Docker 预置的 Navidrome 凭据要在渲染前落进 localStorage（原因见 services/navidromeServerPreset.ts）。
// 和 mod 加载并行跑，自带超时，失败只是这次不套用。
const bootNavidrome = async () => {
    if (!isMainApp) return;
    const result = await bootNavidromeServerPreset();
    // useLibraryStore 在模块加载时就读过开关，这里补一次同步。
    if (result === 'applied') setNavidromeEnabledState(isNavidromeEnabled());
};

// allSettled：mod 加载失败也要等预置写完再渲染，失败原因单独打出来，不吞掉。
void Promise.allSettled([bootFolium(), bootNavidrome()])
    .then(([folium, navidrome]) => {
        if (folium.status === 'rejected') console.error('[Bootstrap] Folium boot failed:', folium.reason);
        if (navidrome.status === 'rejected') console.warn('[Navidrome] Server preset boot failed:', navidrome.reason);
    })
    .finally(() => {
        // Mount the app as soon as the mod/client bootstrap settles. The local-cover service
        // worker is a background resource route, not a render prerequisite: waiting for its
        // registration used to hold this callback forever when register() never settled, leaving
        // the HTML splash animation on screen with no app behind it.
        renderApp();
        void initializeLocalCoverRuntime();
    });
