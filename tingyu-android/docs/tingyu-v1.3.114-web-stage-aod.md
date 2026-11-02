# 1.3.114 同舞台 Web AOD（待真机验收）

## 参考证据

分析本地 Folia 0.3.2 JADX 结果：RearCardView.setAod 更新状态后 render/updateRunning；getInAod 在 OFF 优先返回 false，其他状态允许显式 AOD 与 DOZE/DOZE_SUSPEND；checkDisplayPower 触发策略重算与快照恢复；syncVisibility 对称交还原生绘制。CardRenderPolicy.resolve 分离 subscribe/animate/pushFrames，参考实现活动更新间隔为 500ms，非活动为 1000ms。EngineView.render 将 style、background、textScale、translation、reducedMotion、fps、aod 和读取区域传给同一渲染器。

assets/engine/rear.js 保留同一 visualizer registry 与背景组件；aod 隐藏控制并限制点击，staticMode 使用 reducedMotion，fps 独立参与帧率设置。没有证据表明仅设置 aod 就自动关闭全部高负载效果。本轮独立实现其“同渲染器、分离配置/时钟、分离调度”的机制，未复制反编译代码。

## 修改

- 移除 RearCardAod 的 TextView 与独立缓存读取/计时路径。RearHostView 在 NORMAL/AOD 都显示同一 WebView；HIDDEN 才暂停，不创建 Activity、Overlay 或新的播放器。
- 原生 folia-rear-mode 事件同时传递主文档与歌词 iframe。iframe 完成加载后补发当前状态，避免进入 AOD 时 iframe 尚未监听。
- 原模式、字体、主题、字号、布局、安全区域、素材和歌词数据不变；AOD 仅使用运行时 staticMode、减少动态效果、降低亮度/饱和度、隐藏播放按钮及暂停动态背景。保存配置不被覆盖。
- 逐字时间仍由同一 MotionValue 与现有权威快照驱动。AOD Canvas 不直接设为暂停（否则 Fume 停在旧歌词），改用每 500ms 最多一次绘制；Pixi 自动 ticker 停止并改为手动低频更新，Diorama 从 always 改为 demand，由相同调度触发。背景走静态/暂停，音频 MotionValue 清零，后续音频包不进入渲染器。
- AOD 状态校准 1000ms，语义变更通过既有 ContentObserver 触发立即读取；沿用歌曲身份、epoch、歌词缓存和播放时钟。HIDDEN 停止更新，退出 AOD 恢复用户帧率和同一组件。
- 日志包含 WEB_STAGE_AOD、mode、power、样式、采样次数/平均间隔、clock-sample 触发及音频静音标识；30 秒汇总，不记录歌词文本。实际设备 GPU FPS 与耗电不能从 JS 采样计数推出。

## 验证

TypeScript 通过；7 文件 50 项前端测试通过，含 AOD 2Hz 无 RAF 忙等、Pixi 手动更新、隐藏停止、恢复队列、AOD Seek 与配置不重复发布、取词/播放权回归。Android 912 项 JVM 通过，仪器测试包已编译，未连接真机运行。

浏览器 Playwright：NORMAL → AOD → Seek → NORMAL，Fume 舞台 DOM 身份保留，iframe AOD 生效，页面异常 0；截图在本地 test-results/aod-stage/{normal,aod,resumed}.png。运行脚本 test/manual/rear-aod-web-stage.mjs，可通过 AOD_PREVIEW_URL 指定预览地址。这些截图不是 Android 真机验收。

低功耗参数是待实测的保守预算：歌词 2Hz、校准 1Hz，不声称已在 DOZE 测出功耗下降。原舞台内部的个别第三方动画/Framer 调度仍须真机 Perfetto 与样式逐项核查；不能宣称所有样式所有 GPU 工作已被消除。

## 手机验收

原签名覆盖安装后重启加载模块。在现有原生音乐卡片中进入系统 AOD，应保留舞台风格及当前歌词，逐字高亮按采样推进；暂停、Seek、切歌及连续播放保持当前歌曲。退出 AOD 无页面重建/时间重置。系统关闭 AOD、相机占用、卡片收起仍进入 HIDDEN；再次展开恢复。检视所有常用舞台，特别 Fume、Diorama、Sonnet 的逐字与背景负载。记录系统 DOZE 下是否继续合成 WebView、慢帧与实际耗电。

没有真实 DOZE WebView 失败证据，因此不新增另一套原生 AOD。若设备禁止绘制，保留真实诊断，再评估同风格 Canvas 回退，不恢复居中 TextView 或 LSP 独立窗口。

回滚本轮提交、提高 versionCode 后使用原签名重建；不卸载或清除用户数据。
