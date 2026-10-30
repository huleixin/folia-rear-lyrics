# tools/lx-probe —— 洛雪原生引擎的真实集成探针

用途：在没有真机时，也能回答"原生侧到底能不能在 WebView 不参与的情况下拿到可播放地址"。

它**不是单元测试**：

- 用的是与 APK **完全相同的引擎源码**（`build.gradle` 把 `android/app/src/main/java/.../lx` 当作 sourceDir，
  只排除依赖 Android 的 `LxRuntimeHost.kt`）；
- QuickJS 用 JVM 变体（`io.github.dokar3:quickjs-kt-jvm`），与 Android 变体同源；
- 跑的是**真实的用户脚本**（`scripts/1010-mobile.js`，公开的洛雪手机版音源，MIT）；
- 走**真实网络**，每个拿到的地址再用 1 字节 Range 请求验证（看状态码、`Content-Type`、总长度）。

跑法：

```
cd android && ./gradlew -p ../tools/lx-probe probe \
  --args="scripts/1010-mobile.js <songmid> <songmid> ..."
```

输出示例（2026-10-30 实测）：

```
capabilities: {wy=[flac,320k,128k], tx=[flac,320k,128k], mg=[320k,128k], kw=[...], kg=[...]}
== musicUrl: source=tx type=320k ==
#1..#12 OK host=ws.stream.qqmusic.qq.com / api.liuyunidc.cn
        probe=206 type=audio/mpeg range=bytes 0-0/960887
== summary: 12/12 playable ==
```

注意：脚本自带"可播放性预检"，会额外下载整段音频（约 1.5MB/首）。这是脚本行为，
不是后台机制；评估功耗时要把它算进去（`24MB` 内存上限时该脚本会在第 5 首 OOM，
现为 `64MB`，见 `LxScriptEngine`）。

`scripts/1010-mobile.js` 来自 <https://github.com/Lingeng27/lx-music-1010-source>（MIT），
仅作探针夹具使用，不随 APK 分发。
