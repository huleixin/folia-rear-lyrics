# Android navigation performance audit

Baseline: `6a4ca626` (1.3.82). No Android device was connected during this change.

## Confirmed code defects and changes

- `ComposeChromeHost`: a displayed page's revision had to equal the newest transport revision before accepting a click. Data updates could invalidate a still-visible control before Compose recomposed. Input now requires the same live session and page key, rather than the same data revision. Disabled pages, retired sessions and other destinations remain rejected.
- `MobileSettingsLanding`: a fixed 400ms timer imported the entire settings editor while users were interacting. `MobileStageChrome` independently forced that same import after an idle timeout. Collection preloading had another forced idle deadline. Speculative settings/collection imports now share one serial queue, require idle budget, pause while hidden and defer after recent pointer/keyboard input. Explicit navigation still imports immediately. A started module evaluation cannot be interrupted; one large import remains a potential long task.
- `nativePages`: capability discovery probed the bridge again after the chrome probe. Pages and chrome now share one result.
- `nativeSettingsDocument`: computed styles were repeatedly read during traversal, SVG export and sorting. One capture now reuses styles by element; the cache is discarded before the next capture, so theme/layout updates remain fresh.
- Queue sheet had no motion element or persistent presence owner, so removal was immediate. It now exits under an app-level AnimatePresence owner. Native pages retain Compose ownership; stage exit and glass rendering are unchanged.

## Motion

Native tabs: 8dp, 200ms enter / 180ms exit. Detail push: 28dp, 240ms with opacity; outgoing page retreats by one third of this distance. Pop: reverse direction, 220ms. Curve: cubic-bezier(.16,1,.3,1). Reduced motion still suppresses native transitions. Stage keeps its existing separate policy and NativeStageExit.

Queue and ThemedDialog: 10px upward entry / reverse exit, 180ms, optional 0.99 scale on dialogs. Web coordinates here are CSS pixels. Existing native sleep-menu animation is retained. Dialogs captured inside a native settings document still use the document renderer; these need separate device visual verification.

## Opt-in diagnostic procedure

Set `localStorage.tingyu_navigation_diagnostics = '1'` in WebView debugging and reload; remove the key and reload to disable. JS keeps at most 128 samples and logs `[TingyuNavigation]`. To enable native timestamps: `adb shell setprop log.tag.TingyuNavigation DEBUG`; reset the property to `INFO` to disable.

Records include native interaction/action dispatch, JS event receipt, listener readiness, route publication/native commit, settings module load, document capture, page acknowledgement and a Compose frame boundary. Both native and JS event timestamps use epoch milliseconds for bridge-lag comparison. JS Long Task observation is enabled only with diagnostics. A frame boundary is not proof of GPU presentation or full interactivity; no synthetic P50/P95 or CPU/GPU results are provided.

## Remaining measurement and visual acceptance

The initial cached native boot presentation intentionally has disabled controls until live sessions register. Its visible duration, Chromium startup, eager JS module evaluation, cover decoding and GPU first composition have not been measured on Xiaomi hardware. Do not claim that all cold-start delay is eliminated. Navidrome server-preset network boot is Docker-gated in the inspected source; it is not evidence of an Android network startup stall. SharedPreferences snapshot writes use apply(); synchronous disk writes were not established as the cause.

Use a signed Release build for repeated force-stop/start tests, first navigation versus 30-second navigation, rapid tab/detail returns, reduced motion, both appearances and stage entry/exit. Capture WebView performance/Long Tasks, Android frame timelines and CPU/GPU traces together. No device instrumented runs, screenshots, before/after P50/P95 or lockscreen/navigation gesture acceptance were possible here.

## Automated validation and rollback

Focused Vitest tests cover preload reuse/retry/lifecycle, shared idle serialization/cancellation/background behavior, native bridge session handling, settings capture and route coalescing. JVM regression verifies metadata revisions retain click eligibility while retired sessions and destinations remain blocked. Restore this change's source files to baseline (or revert its commit once committed); no persisted playback, theme or queue data schema changed.

Validation result: 31 focused Vitest cases passed; TypeScript passed; 831 Android Release JVM cases passed (0 failures); signed Release build succeeded using JDK 21. No Android device was connected.
