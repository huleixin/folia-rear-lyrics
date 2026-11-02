# 1.3.103：宿主 AOD 探测与启动证据留存

基线 c813e647 / 1.3.102。本次用户日志确认应用/模块均为 1.3.102，priority=3，但不能从此次导出判断静态资源 FD 修复是否让加载推进。

## 日志事实

最近的 lock_trace 从 uptime 278544927 的 view-state 开始：shown/attached/visible=true，alpha=1，904x572。278545805 后 display 在 DOZE/DOZE_SUSPEND 间变化；278545815 host/paused=aod，同时收到 rear/surface-power sleeping=true；278555301 host-disconnected，随后进入独立窗口。当前播放及独立窗口继续正常。

启动 HTML/JS/complete/created 记录均不在当前 40 条 lock_trace 中；不能把记录缺失解释为“未发生”，也不能把上一轮管道假设当成本次已验证根因。

## 代码确认缺陷与修复

1. RearLyricsTrace 仅保留最后 40 条通用历史，后续电源与歌词更新会挤掉启动证据。本版新增同一现有导出入口里的 Dedicated host startup evidence，记录 host 类事件，最多 96 条，每条 900 字符；新 connect-request 重置。普通电源/歌词事件不写入这块缓冲。不引入采样和轮询，文件总量有界。
2. RearHostHooks.attach 处理 PROBE 时先要求屏幕 ON，再检查是否已有宿主。AOD 正常暂停的现有 View 因而返回 FAILED；原 10 秒 PROBE 随即释放并触发独立回退。本版先复用同一 Activity 的未关闭 View，交由其原显示监听暂停/恢复；只有新建 View 仍要求 ON。没有唤醒 AOD、不强占系统、不改变相机/用户退出规则。
3. 旧 probe 失败丢掉返回原因，并被“宿主暂不可见：aod”覆盖。本版记录 host/probe-failed 的真实 reason 与最高里程碑；start-failed 同样单独留存。hostStatus 导出 progress，即使清除显示会话也可读取最后里程碑/等待/异常。

本轮不重写 HTML、FD、配置或舞台逻辑。未确认真机原舞台已正常首帧，也未解决尚无证据的其他加载问题。

## 验收

新增 JVM 测试覆盖启动缓冲容量、重置、已有 View 在 OFF/AOD 不需重建而仍不渲染、新 Activity/closed 需要新 View；最终构建结果见 Release。

手机覆盖安装 1.3.103（126）后重启宿主/手机，开启一次背屏并等待进入 AOD，再唤醒背屏，导出诊断。检查 Dedicated host startup evidence 中完整的本次 load-url/html-complete/html-script/js-entry/state/configured/ready 链；若缺失，该区仍应留下失败 reason 和 progress。AOD 已有 View 不应再因 PROBE 显示未 ON 而被释放；相机/手动关闭/用户上滑仍应释放或暂停。hostActive 只有真实 ready 后为 true，AOD 时 false 属正常。

没有小米设备连接时，JVM、仪器编译和 APK 签名验证不等同于实际显示成功。回滚 revert 本次提交并提高 versionCode 重建，保留用户数据。
