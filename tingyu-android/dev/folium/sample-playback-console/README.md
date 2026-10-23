# 播放控制台样例（sample-playback-console）

需要 Folium 1.5（桌面版）。在首页加一个「播放控制台」页面：调音量、静音和循环模式，分页浏览并点播播放队列，
列出最近放不了的歌；main 入口把这些失败记录追加写进模组自己的数据目录。

权限：`playback.control`（设音量、静音、循环模式，点播队列）、`filesystem.data`（main 入口的 `api.storage.paths`）。
不用实验接口，不需要账号或网络。

## 安装

这个目录**没有签名**，开发版也**不会自动扫描** `dev/folium/`，需要手动安装（装好后在模组面板里显示为「未验证」）：

- **打 zip 拖进去**：把整个目录打成 zip，拖到模组面板上。`mod.json` 在 zip 里唯一的顶层文件夹里也可以：

  ```powershell
  Compress-Archive -Path dev/folium/sample-playback-console -DestinationPath sample-playback-console.zip
  ```

- **复制到用户模组目录**：模组面板右上角「打开模组目录」，把 `sample-playback-console` 目录复制进去，再点「重载」。
- 开发时也可以临时复制到仓库的 `mods/` 下，享受开发目录「改了文件不用重新确认」的豁免；但不要提交到那里：`mods/` 里的模组必须带官方签名，
  `test/unit/mod-system/sampleMods.test.ts` 会失败。

然后在模组面板里启用「播放控制台（样例）」并确认。

## 试用

1. 在 Grid 或 Bravais 首页的导航里选「播放控制台」，或在命令面板里运行「打开播放控制台」。
2. 拖动音量滑块、点「静音」、切换循环模式；再用宿主自己的音量面板或循环按钮改一下，页面跟着变（`playback.volumeChanged` / `loopModeChanged`）。
   松手时才调用一次 `setVolume`：宿主每次调用都会保存。
3. 播放队列每页 50 首，打开时以正在播放的歌为中心；「上一页」「下一页」翻页，「回到当前」重新居中。点一首就播放它。
   队列在这期间变了（打乱、入队、切到私人 FM）时页面自动刷新（`playback.queueChanged`）；如果点的那一刻那个位置已经换了歌，
   `playQueueItem` 带着 `ref` 会拒绝，页面提示并刷新。私人 FM 下照常点播；外部 Stage 播放时列表只能看，不能点。
4. 放一首当前账号放不了的歌（例如需要会员的），「最近无法播放」里会多一条，写明原因、阶段，以及宿主是否在倒计时跳过。
   记录同时追加到 `<userData>/mods-data/sample-playback-console/files/failures.log`（每行一个 JSON，超过 256 KB 时换到 `failures.1.log`）。
5. 在模组面板展开这个模组，能看到「数据」「缓存」的占用。点「清空缓存」会删掉 `mods-cache/sample-playback-console/recent-failures.json`；
   下次记录失败或重载模组时，main 入口从日志重建它。页面上已经显示的记录不受影响。

## 演示了哪些 1.5 接口

| 接口 | 在哪 |
| --- | --- |
| `registries.homeTabs`、`ui.openHomeTab` | `client.mjs` 的 `activate`：注册页面和打开它的命令 |
| `playback.getVolume` / `setVolume` / `setMuted` | 音量卡片 |
| `playback.getLoopMode` / `setLoopMode` | 循环模式卡片 |
| `playback.getQueue({ offset, limit })` | 队列分页；不传 `offset` 时以当前歌曲为中心 |
| `playback.playQueueItem(index, ref)` | 点队列里的一首 |
| `playback.volumeChanged` / `loopModeChanged` / `queueChanged` / `failed` | 页面挂载时订阅、卸载时取消 |
| `playback.failed` 的 `priority: 'high'` 处理器 | `createFailureLog`：模组活着就记录，页面关着也记；`willAutoSkip` 只是事件发出那一刻宿主的打算 |
| `api.storage.paths.data` | `index.cjs`：追加写 `failures.log` |
| `api.storage.paths.cache` | `index.cjs`：最多 30 条的 `recent-failures.json`，清空后从日志重建 |
| `folium.rpc` / `api.rpc.handle` | `recordFailure`、`recentFailures` |

`test/unit/mod-system/devFoliumSamples.test.ts` 校验清单，用真实的 `createModApi` 跑 main 入口（追加、缓存、清空后重建），
并在 jsdom 里用一个替身 `folium` 跑 client 页面。
