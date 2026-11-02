# 视频验收与1.3.109宿主卡片导航差异
输入：用户VID_20261101_083130.mp4（8.45秒，60fps）及诊断20261103-000712。
本轮已实际用ffmpeg提取逐秒与4–8秒每秒4帧查看：歌词初始占满背屏可见区域，约5.75–6秒由手势返回红色系统表盘，约7–7.5秒再次操作后歌词随系统过渡出现。仅凭录像不能确认每次手指方向、是否长按/双击，也不能证明所有卡片模式。

## 当前事实修正
本次日志已出现system-music-slot content、profile=426091419、panel=MainPanel、bind=t和E2.i→FrameLayouts→RelativeLayout→MainPanel父链，后续page-ready/drawn/ready。与1.3.108不同，这次不是未挂载便独立窗口回退。用户仍不满意的实际交互/形态必须按视频验收，不能用挂载成功回应“完成”。
视频里的歌词画面同样覆盖当时背屏可见区域，所以实现目标不是人为缩小圆角或裁剪WebView，而是保留系统能够将其作为卡片退出/返回/切换的行为。截图单独不能确定手势哪里失败。

## 与参考APK的源码差异
FoliaHook在真实MamlView中添加RearCardView，NativeMusicCard暂停原绘制，RearCardView.setHostPaused只暂停活动，恢复时recoverSnapshot，不根据上滑方向永久清除显示会话。
听屿RearHostView却额外记录nativeGesture并在pause/hidden/detach结合1.5秒时间窗调用userExit，关闭View并report user-exit，应用侧dismissDisplaySession结束显示意图。该分支与视频“离开后通过系统回到同卡片”相冲突。当前诊断未出现user-exit，不能宣称本次手势一定触发了它；它是代码确认的错误条件，需删除且真机验证实际导航。
此外听屿hide会立即restore原生绘制并将stage设INVISIBLE，即使只是系统切换卡片。这会让系统正在移动的内容中途被原音乐画面替换，与保留卡片内容随父容器动画的目标不符。
系统SubScreenLauncher.dispatchTouchEvent会先交给原生GestureManager，再发送ACTION_CANCEL给被其接管的内容；不应由WebView/舞台重建导航。

## 本轮修改
- 移除宿主卡片路径中的上滑时间推断及永久user-exit调用。独立Activity手势与显式设置关闭不改；系统销毁容器、媒体归属失效仍按原清理流程。
- 系统普通导航暂不可见时保留同一显示租约、View和最后歌词帧，仅暂停WebView自身渲染；相机、AOD/息屏、失去媒体归属、显式停止仍释放必要的原绘制资源。不主动唤起或抢回系统页面。
- 回到原卡复用原WebView并用原resync恢复，不重新播放、不重载队列。
- 精确被接管root的needDisallowInterceptTouchEvent返回false，防原MAML遗留的触摸拦截标记干扰系统父层。仅ownMedia/owned和root实例均一致时生效，其他MAML不改。
- paused日志明确nativeNavigationRetained和租约保持，后续区分“系统暂时离开”与“已经永久停止”。
均为独立实现。Folia私有反编译源码/模板/素材未拷入公开仓库。

测试：新增系统暂离/返回50轮纯策略回归及相机、取消、失去媒体、卸载父容器、息屏不保留条件；全量JVM及仪器测试编译见最终报告。未连接真机，既没有证明视频的系统动作已复现，也没有把ready当最终验收。测试包供覆盖安装后比较视频操作；若只看初始截图外观，无法判断卡片是否能按原生机制导航。
