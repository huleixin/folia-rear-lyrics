# 1.3.106 真机卡槽未挂载：宿主版本不一致

2026-11-02用户提供诊断20261102-232418及背屏截图。截图显示全屏舞台，不能作为原生小卡片成功证据。

## 本次确认

- App运行构建1.3.106@96d919a7，hostConnected=true、hostActive=false。
- MAML已选择听屿，own=1；不需要重新修MediaController、Binder或首帧。
- 最早明确阻塞：systemSlot=unsupported system slot profile versionCode=426091419。
- 最终前台为io.github.huleixin.tingyu/.RearLyricsActivity：截图来自独立窗口安全回退，系统卡槽尚未创建歌词View。
- 先前提供xmbp.apk的Manifest为versionCode26010521，versionName RELEASE-1.0.2601052145，与运行中版本不一致。因此前一报告中“对应系统APK”应理解为已提供的宿主样本，不能认定是当前安装版本。
- 不能由现有证据认定用户导出方式或系统版本变化的具体原因，也不能直接将426091419加入旧字段映射。

## 本轮最小修复

RearSystemCardBinding记录运行versionName/versionCode与支持的profile版本；RearHostHooks将不支持的版本作为明确FAILED/blocked，而不持续PENDING直至“首帧未确认”。合法旧版门禁、媒体身份和卡槽身份不放宽。新增进度回归测试保留真正阻塞阶段。该修改改善失败处理，不解决新版系统的卡片接入，因此不独立发布测试APK。

## 获取正在使用的宿主

本机adb devices无设备，不能远程从手机拉取。需要当前已安装版本426091419的APK（如有split也需完整）。

连接电脑后，先用adb shell dumpsys package com.xiaomi.subscreencenter核对versionCode及codePath；
用adb shell pm path com.xiaomi.subscreencenter取得所有package:路径，
逐条adb pull对应路径。不要只取/system下出厂版本；以pm path当前返回为准。
保留APK及版本信息即可，不需要上传用户数据或诊断原文到公开仓库。

若只能在手机操作，在现有能导出应用APK的工具中选择当前“背屏中心”安装项，导出后确认versionCode=426091419；请勿再次导出26010521的出厂包。该版本实际类、字段与资源需重新核对后再建立profile，不靠取消校验试错。
