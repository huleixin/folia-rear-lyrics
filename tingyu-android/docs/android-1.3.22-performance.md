# Android 1.3.22: playlist affordances and bounded rendering work

Version 1.3.22, Android code 46, regular signed release.

## Changes

- Replace the playlist locate-current text pill with a compact dark-jade circular target icon. The accessible label and filtered/out-of-window locate behavior are preserved. The icon is drawn locally without blur or an external bitmap.
- Animate only the visible current track's three bars at 20 Hz. Phase state is read in the Canvas draw pass, not by the list composition. Pause uses a static pause mark; reduced-motion settings stop the timer. This is a playback-state animation, not an FFT visualization. Removing the row/page cancels its coroutine.
- Size the playlist number column from the total digit count and font scale. Keep numbers on one line and right-align them, including 180–189 and four-digit lists.
- Freeze the last graphics frame while native stage collapse animates. Suspend the dedicated canvas/background RAF queues and Pixi tickers without changing UI animation scheduling or audio playback. On committed return, hide the retained visualizer, allow two destination frames, then retire its GPU resources in an idle callback with a timeout. Quick re-entry cancels stale retirement. Blocked navigation releases suspension instead of freezing the stage indefinitely.
- Unchanged native page/chrome data no longer triggers synchronous layout effects on every parent render. Native footers use shell-owned geometry without measuring invisible HTML footer poses. Playlist row mapping and current-track lookup are memoized.
- On Android, delay Web Audio creation only while **all** processing demand is absent: no visible main/awake rear-stage analysis, no enabled equalizer/effects, no automix, ReplayGain off and playback fade off. Existing requested functions remain honored. Entering a stage or enabling processing creates the existing graph during playback. Desktop behavior is unchanged.
- After both audio decks stop, wait 600 ms for transport fades/drain and suspend the AudioContext. Real media events resume it. An outgoing automix tail prevents suspension, and Play racing an in-flight suspend resumes afterward. Listeners and pending timers are removed on disposal.

## Verification

- TypeScript typecheck and production Capacitor build passed.
- 712 JavaScript tests passed; one existing visualizer test skipped. Coverage includes actual adapter/transport behavior, stage retention/re-entry, graphics suspension, pause/resume races, both-deck idle gating, unchanged-model measurement, filtered and paginated locate, and the affected visualizer suites.
- 108 Android JVM tests passed, including number-width/font-scale and indicator phase/bounds checks.
- 50 browser flow checks passed, including 30 playlist entry/return cycles. Mock native listener count stayed at four on every sampled cycle. Timings include an intentional 450 ms settling delay and are **not** device latency measurements.
- Five additional real Chrome audio checks passed using the existing ordinary-playback probe: plain-element playback advances without a context; stage entry attaches a working analyser to the playing source; Pause suspends after drain; Play resumes the context and advances media time; no uncaught errors. No remote music or user account was needed.
- Browser plugin was unavailable, so regular Playwright was used. Navigation tests mock the native bridge and do not validate Compose pixels, Android GPU load, battery consumption, or real touch latency. No physical phone was connected or operated.
- Production APK excludes development QA pages, retains bundled segmentation workers, reports the expected application/version, and passes APK v2/v3 signature verification using the existing Tingyu certificate.

## Remaining work and limits

This round does not replace the playback engine with Media3. A context already attached to HTML media stays attached until that media element is replaced; it cannot simply be disconnected to restore plain media output. Thus leaving a stage does not promise a return to a native offloaded audio path. Default playback fade or enabled processing also legitimately retains the graph while music plays. These changes do not establish a measured power-saving percentage.

Future native playback migration must preserve provider resolution, authenticated/proxied streams, local/cache URLs, recovery, lock-screen transport and optional effects/visualization. Real-device profiling remains necessary to distinguish steady audio cost, individual shader cost and thermal throttling from navigation resource retention.
