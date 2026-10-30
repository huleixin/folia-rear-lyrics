# C3 闪退修复：播放一开始就崩溃

版本：1.3.50 / 74（未改动）　分支：`native-bg-playback`（未合并 main）
对象包：`deliverables/Tingyu-Android-v1.3.50-c3-hotfix-crash.apk`

## 一、结论

**根因是一处线程安全回归，C3 引入。** 上一版让「原生取词线程」第一次开始写
`ColorOsLyricBridge` 的时间轴表，而这张表是 **access-order 的 `LinkedHashMap`**
（`get()` 都会改结构），主线程却在 `buildMetadata` 里对它执行 `pin()` / `attach()` /
`metadataLyricInfoFor()`，**全部没有加锁**。两边一撞就是
`java.util.ConcurrentModificationException`，位置在主线程 → 进程直接退出。

时间点刚好对上「点播放就闪退」：

1. 点播放 → `NativeAudioEngine.load` → `scheduleSongInfo` 起一次原生取词；
2. 同一秒内主线程要发布好几次 metadata（`onStartCommand`、`duration-corrected`、
   `refreshArtwork` 回调），每次都会 `pin` + `attach` 去读那张表；
3. 取词线程（LRCLIB / 酷狗，通常 0.3～3 秒）回来调 `setPending` 往里写；
4. 读写重叠 → 主线程抛 CME → 闪退。

C3 之前 `setPending` 只有 WebView 插件（主线程）在调，所以这张表事实上是单线程的；
是「把取词搬到原生」这个改动让它变成了共享可变状态，而加锁没跟上。

## 二、证据（可复现）

新增 `android/app/src/test/java/.../coloros/LyricBridgeConcurrencyTest.java`：3 个写线程
（`setPending` + `pin` + `protectAhead`，模拟取词线程与换歌）、3 个读线程
（`stateOf` / `metadataLyricInfoFor` / `lyricInfoFor` / `hasTranslationFor` / `describe`，
模拟主线程发 metadata），各 400 轮。

- 在**未加锁**的本版代码上：`FAILED`，捕获到
  `java.util.ConcurrentModificationException`；
- 加锁后：通过（全量 `testDebugUnitTest` **372/372**）。

## 三、改了什么

1. **`coloros/ColorOsLyricBridge`（根因修复）**
   `pin` / `protectAhead` / `trimTimelines` / `lyricInfoFor` / `metadataLyricInfoFor` /
   `stateOf` / `hasTranslationFor` / `describe` / `attach` 全部 `synchronized`，与已有的
   `setPending` / `clear` / `clearSong` 共用同一把类锁。都是纯内存的短操作，没有嵌套锁，
   不会引入死锁（`attach` → `metadataLyricInfoFor`、`describe` → `stateOf` 都是同锁重入）。

2. **`playback/NativeAudioEngine`（避免同一类问题再来一次）**
   - `scheduleSongInfo` 整段 `try/catch(Throwable)`：把栈写进 `CrashDiagnostics`
     （诊断报告里能看到），播放继续。歌曲信息是增值动作，不该有终止进程的权力。
   - `scheduleSongInfoForCurrent` 增加主线程兜底与非空校验。
   - `currentKey()`：非主线程不再访问 Media3 的 `Player`（Media3 只允许应用线程读，
     后台线程访问会抛 `IllegalStateException`，把那条任务静默干掉），改读缓存的 `songKey`。

3. **`playback/SongInfoLoader`（隔离 + 去跨线程访问）**
   - `isCurrent()` 改为与自己记录的「换歌入口曲」比较，不再从取词/取图线程反问引擎；
   - 两个线程池的任务体全部 `catch(Throwable)` → 记 `songinfo-failure` + `CrashDiagnostics`；
   - `onTrackChanged` / `refresh` 在**主线程**入口也整体兜住（这里正是能带走进程的位置）；
   - `setPending` 的超长 payload（>200k，桥上会抛）改为记录 `payload-too-large` 并放弃该首。

4. **`FoliaPlaybackService`**
   - `applyNativeLyric` / `applyNativeArtwork` 投递到主线程的整段 `try/catch`，失败只记崩溃线索；
   - `restoreFromEngine` 补上 `artwork` 字段与 `durationMs`（原先只读 `coverUrl`/`duration`，
     服务被系统重建后必然退回占位图并丢掉封面）。

5. **API 兼容（真实隐患，非本机崩溃点）**
   `NativeLyricsRepository` / `NativeArtworkRepository` 的整文件读取从
   `java.nio.file.Files`（**API 26+**）改为 `FileInputStream`。本项目 minSdk 是 24，
   在 Android 7 上第一次读缓存就会 `NoClassDefFoundError` 闪退。

## 四、测试

- JVM：`testDebugUnitTest` **372/372**（新增并发用例 1 项；其余 371 项未变）。
- 前端：本轮未改任何 TS/TSX，未重跑全量（上一轮 6792 通过 / 15 项为干净树既有失败）。
- 未做：真机验证（本机无设备、无 emulator，`adb devices` 为空）。

## 五、如果还闪退

诊断报告已包含 `crash diagnostics` 段（`CrashDiagnostics` 记录 `native-uncaught` 的线程名与完整栈）。
若仍闪退，请复现一次后重新打开 App、导出诊断报告：报告里会出现崩溃栈，本节即可定位到具体行。
本轮新增的 `songinfo-failure{source=…}` 也用于区分「原生取词链路炸了」与「别的模块炸了」。

## 六、没动的部分

C1 的锁屏时长（`durationMsFor` / `PlaylistDuration` / `PlaybackPositionClock`）、Media3 续播与队列、
QuickJS / 洛雪、背屏与灵动岛、播放器 UI、版本号（仍 1.3.50 / 74）。
