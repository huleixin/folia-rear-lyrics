# Pad 推荐页密度与歌单修复 1.5.37

基线 2c4751bc（1.5.36）；分支 feat/tablet-adaptive；versionCode 252；未合并 main。

## 改动

- 原生首页适配器不再把已加载歌单摘要固定截成 4 项，后续卡片沿用原有打开、更多菜单及集合身份。简介作短摘要处理。原有缓存预热仍只处理前 4 项；未新增全量歌单歌曲请求，不修改登录或平台接口。
- 手机在线首页在原生呈现端保留原来的四项摘要；本地首页不受此限制改动影响。Pad 窄窗口和竖屏保留原布局及向下滚动的已加载歌单。
- Pad 横屏按内容可用宽度排列 4–5 列；歌单逐行进入 LazyColumn，可滚动到后续已加载项，避免把整个歌单目录放进同一个 Lazy item 一次性排版。图片继续沿用 Coil 懒加载。
- 推荐大卡和最近播放共享窗口高度预算。推荐大卡高度约束在 220–300dp，普通宽屏通常约 280dp，较短窗口进一步收紧。保留原真实推荐素材、三卡轮播、手动切换与进入歌单动作；最近播放仍为 2×2，同步缩小缩略图高度。
- 分区标题 20sp、卡片标题 16sp、辅助信息 13sp；歌单封面改为 1.5:1。手机共用标题控件仍默认 16sp，没有改变手机字号。
- 列表视口根据宿主实际底部播放条位置留出空间并裁剪可见内容，背景仍全幅绘制。修复底部避让计算把宽屏竖向导航栏误算成水平底栏的问题；避免把左侧导航的顶部当作内容底边。

这里的“全部”指现有音乐接口已经加载到应用内的歌单；不新增另一套平台分页或歌曲详情预取业务。首屏展示一行，后续向下滚动。

## 验证

前端定向回归 767 项、67 文件通过。新增用例验证 25 个歌单摘要全部进入原生模型，最后一个可触发原动作，同时预热仍为 4 项。类型检查、主题校验、网页构建及 Capacitor 同步通过。

原生截图覆盖三套主题的横屏首页、Pad 竖屏、640dp 分屏、手机及末尾歌单。使用 200 个合成歌单、真实推荐图片素材、真实 Compose 触摸和迷你播放器控件；核对首行 5 个完整卡片位于播放条上方、列表只组合少量可见行、末尾第 200 个歌单动作可用。手机仍为 4 个摘要，竖屏和分屏可滚动点击第 20 个歌单。完整原生 1387 项通过，零失败、零跳过；最终构建/签名结果见随包 summary.json 和日志。

部分机器上的 Kotlin 增量元数据失效曾导致已存在的符号解析失败；最终原生验证通过关闭增量编译强制完整编译运行，不删除源码或跳过测试。

## 限制

截图和触摸来自 JVM/Robolectric，不是实机 GPU 验收。软件 Canvas 截图使用 SDK30 的既有非模糊路径；未登录用户真实 QQ/网易云账户，未连接真实平板。请安装后复测实际歌单数量、封面裁切、三主题、分屏/旋转、播放条操作和连续滚动。未更换播放器、歌词引擎或手机导航动画。

## 合并

保持 feat/tablet-adaptive 独立分支。预览包完成手机和 Pad 实机确认后再按仓库流程合并，本次不自动合并 main。

## 修改文件

- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/PadHomeDensityTest.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/ComposeChromeHost.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeFooterLayout.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeHomePage.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageWidgets.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/PadHomePage.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativeFooterLayoutTest.kt`
- `docs/PAD-HOME-1.5.37.md`
- `package-lock.json`
- `package.json`
- `src/library/suites/mobile/native/NativeHomeOverview.tsx`
- `test/unit/library/nativeHomeOverview.test.ts`
