<!-- docs/android-compose-design-restoration.md -->
# Compose page design restoration — 1.3.20-beta.8

The beta.7 generic renderer changed the established mobile layouts. Dedicated native
renderers now follow the existing mobile CSS instead of turning every section into
large cards. Native ownership from the first frame remains enabled; this change
does not restore a WebView-first/native-ready handoff.

## Original layout references

- Home: `mobileLibrary.css`, `mobileRecommendations.css`, `MobileHomeOverview.tsx`.
  Restore the 73vw recommendation rail (7:6 cards), pagination, square horizontal
  recent artwork, and compact two-column playlist rows and context menus.
- Library: `mobileLibraryPage.css`, `MobileLibraryOnline.tsx`, `MobileDirectory.tsx`.
  Restore fixed header/filter, 40px filter, sort dropdown, and contiguous 68px rows
  with 56px artwork. Keep row-window paging and existing business actions.
- Search: `searchWorkspace.css`, `SearchLanding.tsx`.
  Restore the 46px input with external close action, wrapping history chips,
  two-column numbered hot searches with expansion, compact results and source tabs.
- Settings: `MobileSettingsNavigation.tsx`, `AndroidRearLyricsSetting.tsx`,
  `RearBridgeSettings.tsx`. Restore grouped cards with 13px row headings and 11px
  descriptions, original icon geometry, rear-display illustration, backend selector,
  status, startup guide and help. Resolve the system-state translation key. Do not
  replay the obsolete settings snapshot schema on upgrade.

Measurements use the WebView CSS viewport scale, not a second independent Compose
font scale. `NativePageDesign` pins key metrics in native unit tests. Lucide paths
are bundled as raw resources alongside their license, matching the existing web
icons. Recommendation artwork and the rear-display illustration remain APK assets.

## Validation and limits

- TypeScript type checking and targeted native bridge/search/settings unit tests.
- Android Kotlin compilation and JVM tests, including layout metric contracts.
- Browser bridge integration checks for first-frame ownership, actions, overlays,
  paging, stage navigation and responsive surface geometry.
- Signed release APK build and signature/package verification.

The browser bridge harness verifies models and routing, not Compose pixels.
No physical phone was used. The local emulator could not boot with the available
host configuration. Native screenshots, animation frame timing, and power savings
therefore remain unmeasured; successful builds and unit tests do not replace those
checks. This release targets the four reported page layouts, not a redesign of
playlist detail, lyric effects, audio playback, or the LSP service.
