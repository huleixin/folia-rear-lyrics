# Android 1.3.21: playback responsiveness and navigation

Version: 1.3.21, Android version code 45. This is a regular release, not a beta.

## Reported failures and changes

- Native transport buttons previously forwarded a numeric bridge value into DOM-compatible click callbacks. Play/pause and loop could throw `stopPropagation is not a function`. The bridge now distinguishes commands from the numeric seek/navigation actions.
- An explicit Play during session restore could be lost before the audio source or element was ready. It now waits for the same song's source **and its committed audio element**, remains cancellable by Pause/skip, retries the registered restore context, and reports loading/failure. Artwork and theme hydration no longer block source restoration.
- The invisible HTML footer could publish an old position or an intermediate opacity. Native footers now derive geometry and visibility from the logical route, playlist state and actual safe insets. Entering a stage no longer mutates footer enablement. Returning without changing songs restores the navigation and mini-player.
- Multi-store history restoration is coalesced before native page/chrome packets. Settings opened over a retained playlist still return to the stage first. Stage/settings transitions use a fade instead of translating live WebView preview holes. Stage collapse animates the actual WebView and controls before committing history, reusing the existing retained page rather than creating a second saveable-state subtree. Recommendation/library tab motion is unchanged.
- Playlist “locate current song” is restored, including filtered lists and targets beyond the initial 100 rows. The current row has a jade title, stronger weight/background, an edge marker and a static playback indicator. Cached rows derive selection from the current song key rather than old row flags. A bounded native row cache survives re-entry, invalidates changed row identities/counts, and permits a new adapter to retry a retired session's range requests.
- Android Chinese/Japanese dictionary loading, construction and segmentation run in a worker. Only word boundaries return to the UI thread. Text matching rejects stale replies while preserving newer timing/translation edits. The worker memoizes a bounded set of results; desktop segmentation stays unchanged.
- Canvas stage loops, ambient background loops and Pixi tickers now actually use the graphics frame budget. Foreground defaults to 60 Hz and ambient loops to 30 Hz; explicit frame-rate choices remain respected. Browser/React/Compose navigation and input scheduling are not globally throttled. The main visualizer is not mounted behind opaque native browsing pages.
- Native pages and footers share a Coil memory/disk artwork cache (disk limit 64 MiB). Data thumbnails have stable memory keys. Web cover loads coalesce concurrent reads/downloads and retain a bounded 8 MiB/64-entry blob memo, while keeping separate object URLs so one page cannot revoke another's cover.

## Validation

- TypeScript typecheck and production Capacitor build passed.
- 700 JavaScript tests passed, one existing visualizer test skipped: transport/restore, native command dispatch, route commit, footer adapters, playlist locate/filter/highlight, worker segmentation, cover cache, frame budgets, and affected Fume/Hanabi/Lumiere/Pendolo rendering behavior.
- 106 Android JVM tests passed, including footer safe-area math, tab/return motion policy, stage-exit completion and retained row requests.
- 49 Playwright checks passed at 393 × 852, DPR 2. Flows include delayed source restore followed by the first mini-player Play, repeated playlist entry/return without track changes, settings levels, style/playback settings returning to stage, real generated audio playback/pause/seek while Fume animates, and stage collapse invoking the native exit before history changes. No uncaught browser errors.
- Browser plugin was unavailable; regular Playwright used a mocked native transport and local fixtures. The browser verifies actual WebView-side state/audio/rendering and bridge contracts, **not Compose pixels, device GPU frame time, touch latency or power draw**. No physical phone was connected or operated.
- The APK contains production entry points and bundled worker assets; development QA pages are excluded. Release signing and package version are checked separately during packaging.

Further real-device profiling may still be needed for individual shaders/stages. These checks do not establish a measured percentage reduction in power consumption.
