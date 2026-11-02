# 1.3.102：静态资源桥解除管道队头阻塞

基线 6b8c7f11 / 1.3.101，保留现有专属宿主、状态/歌词、显示所有权及安全回退。

## 真机证据

用户 18:49 导出记录了 webview-created、load-url、created、first-draw(ready=false)、html-ok、script-ok、css-ok；view-state 为 shown/attached/visible=true、alpha=1、904x572。没有 html-script、page-commit/finished、js-entry、React/state。因此无需再改 Context、Binder、电源或 alpha；故障发生在主文档执行之前。html-ok/script-ok 旧实现只证明打开了输入流，不证明 WebView 已消费完内容。

## 代码确认的阻塞风险

Provider 将所有资源交给 ThreadPoolExecutor(2,4, queue=64) 写管道。队列未满时只运行两个线程；大资源写入超过管道容量，且 Chromium 暂缓读取 modulepreload 时，两个写线程可同时阻塞。随后 HTML/CSS 的写任务排队，HTML 解析或主模块初始化等不到 EOF。当前 matchScore modulepreload 约 2.5MB。打开 InputStream 立刻报告成功，掩盖了传输尚未完成。

这是可由源码确定的调度风险，且与真机执行前停顿吻合；没有设备线程栈，不能声称已经百分之百证明真机两条线程当时都堵在 write。

## 修复

- build.gradle：静态启动资源 html/js/css/json/wasm/font/svg 不压缩，使 AssetManager.openFd 可取得 APK 文件描述符、offset 和 length。
- RearHostProvider.openAssetFile：在原有 UID、当前 LSP 会话、只读模式、HTTPS 本地域名和路径校验之后，对静态资源返回 AssetFileDescriptor。ContentResolver.openInputStream 保留 offset/length，Chromium 可按自身调度直接读取，不经流写线程、不拷贝全量资源到内存、不暴露 APK 之外的文件。
- 动态 state/lyrics、服务 worker stub 继续已有流路径；非启动类压缩素材保留兼容回退。没有增加线程数或首帧超时。
- RearHostWebClient：HTML/首个 JS/CSS 流真正读到 EOF 才报告对应 complete 和字节数，仍有固定去重上限。
- RearHostProgress：html-complete/html-script 进入最高里程碑，probe 不会覆盖。

现有 ready 仍必须从完整舞台 onConfigured 到达，再经过可见绘制；文件描述符读取完成不表示舞台已成功。

## 验证

新增 Android 仪器测试：实际 packaged APK 中同时打开两个未读 JS FD，再将 HTML 完整读到限定 EOF，验证互相不阻塞且不越过资源边界。无设备时仅编译。Release 后检查 ZIP 中所有 html/js/css 的压缩方法为 STORED；最终测试数、签名、APK SHA 与发布结果见 Release。

手机覆盖安装 1.3.102（125）后重启手机/背屏中心。预期 html-complete/html-script → js-entry → state-config/config-received → configured/ready-request/page-ready → drawn/ready，hostActive 才为 true。若仍失败，导出本版诊断，检查是否 complete 缺失、JS 未执行或配置未到。无真机不得宣称显示修复成功。

回滚：revert 本次独立提交并提高 versionCode 重建，不清数据；独立窗口、Shizuku 和播放器不受本轮代码修改。
