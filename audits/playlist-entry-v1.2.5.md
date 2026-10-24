# 听屿 Android 1.2.5：首次打开歌单详情优化

## 发现与修复

推荐页和资料库最终进入同一 `MobileCollection`。此前入口仅在第一次点击时执行动态 import，代码与 CSS 需冷加载；宿主 Suspense 为 null，加载期间无法展示详情。即使提前获得 fulfilled Promise，直接让 React.lazy 首次消费它仍可能挂起。新版保留分包，在移动浏览页首帧后的空闲时机预载，触摸/焦点提供提前触发，入口与预载共享一个 Promise。已解析模块直接同步渲染，未解析时仍沿原有 Suspense 路径按需加载，不人为增加跳转延迟。

预载不挂载隐藏详情页，不读取用户歌单、不请求音源、不提前播放，不进入播放器核心。页面卸载、后台切换会取消未执行任务；回前台再安排。失败后真实进入可重试，不循环请求。仅修改 MobileHome 共用入口，推荐页和资料库均覆盖。

另一个渲染竞争点：完整歌单缓存命中以前按 urgent 通知渲染，而网络首页和补页已有 background/React transition 路径。现在缓存曲目也走该路径，资源本身仍立即 ready，不修改顺序、权限、缓存有效期或分页规则。React transition 不能把单个同步函数拆成多线程；这项调整降低更新优先级，并非宣称消除了所有长任务。

## 验证

- TypeScript 类型检查通过。
- 64 个测试文件、718 项针对性单测通过；覆盖冷模块加载、并发去重、首次预载后直接渲染、不显示 Suspense 回退、失败重试、空闲/后台/卸载清理，以及 3000 首真实结构模拟曲目的缓存顺序与更新提示。
- 扩展套件为 734 通过、2 失败。两项 `layerBoundaries.test.ts` 失败在未修改的 1.2.4 Git 源码上独立复跑确认一致：SearchResultRow 引用 MobileSheet、MobilePlaylistHeader 引用 omni 获取来源名称。没有放宽或删除这两个断言。移除该已知失败测试文件后，718 项全部通过；原始与基线日志随本地验证留存。
- 32 项 Android release 原生测试通过；正式前端构建、Capacitor 同步、assembleRelease 成功。
- APK 包名 `io.github.huleixin.tingyu`、版本 `1.2.5` / code `8`，签名沿用原证书，SHA256 `a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d`。
- 没有连接 Android 真机，也没有可用模拟器；本地浏览器预览仍受环境策略限制。本轮没有真实渲染截图或首次进入帧耗时，不能据此声称已在用户设备上消除掉帧。请覆盖安装 APK 后，分别冷启动并从推荐页、资料库首次进入歌单确认。

## 范围保护

没有修改 CSS、Liquid Glass、底栏图标/布局/动效、歌单页面布局、封面取色、播放器核心、前后屏歌词、摄像头避让、音源接口或 Android 原生代码。没有清空或迁移用户数据。新增预载只处理模块资源。

## 文件清单

- `package-lock.json`
- `package.json`
- `src/library/core/services/onlineCollectionResource.ts`
- `src/library/suites/mobile/MobileHome.tsx`
- `src/library/suites/mobile/entry.ts`
- `test/unit/library/core/onlineCollectionResource.test.ts`
- `test/unit/library/suiteEntries.test.ts`
- `src/library/suites/mobile/mobileCollectionPreload.ts`
- `src/library/suites/mobile/useMobileCollectionPreload.ts`
- `test/unit/library/mobileCollectionPreload.test.ts`

源码分支：`tingyu/playlist-entry-v1.2.5`；标签：`tingyu-v1.2.5-playlist-entry`。需要安装本次 APK 以使用修复。
