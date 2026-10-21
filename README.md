# Folia 小米背屏歌词

Folia Android 的小米 17 Pro 背屏歌词适配测试版。保留 Folia 的歌词样式、主题和动画，背景铺满背屏，主要可读内容在右侧避开镜头。

## 下载

- [直接下载 r244 APK](https://github.com/huleixin/folia-rear-lyrics/releases/download/rear-r244/Folia-Android-rear-r244-debug.apk)
- [版本说明](https://github.com/huleixin/folia-rear-lyrics/releases/tag/rear-r244)

这是 **debug 测试版**，不是 Folia 官方 Android 发布。包名 `top.izuna.foliamajor`，versionCode `244`，版本 `0.7.20-android.194-rear.r244`。已安装本系列且签名一致的旧版本可以覆盖安装；高版本或不同签名的 Folia 不保证能直接覆盖，请先备份数据。

背屏功能需要兼容的小米设备及 Shizuku 授权。本版针对小米 17 Pro、澎湃 OS 4.0.4.0 的适配反馈迭代，实际锁屏和系统兼容性仍需真机验证，不保证所有小米机型或系统版本都可用。

## r244 修改

- 背屏直接采样音频进度，不再依赖主屏上一动画帧的进度。
- 平滑校正小幅时钟误差，减少歌词前后跳；保留真实拖动进度和切歌时的跳转。
- 不调整原有背屏歌词布局、字体、主题和动画样式。

验证：54 项相关前端单测、27 项 Android 单测通过；两种尺寸的打包页面浏览器模拟验证通过。未连接真实手机，以上不等于真机兼容性保证。

## 原项目与署名

原项目：[chthollyphile/folia-major](https://github.com/chthollyphile/folia-major)。Android 移植来源：[whycfawa/folia-android](https://github.com/whycfawa/folia-android)。感谢原作者及贡献者。

本仓库目前用于分发安装包；本版修改源码尚未上传，需要另行确认公开授权。原项目许可证为 GNU AGPL v3，详见 [LICENSE](LICENSE)。

APK SHA-256：

```text
DA45EA11807E72527D2510892BECE975BF6C1145F723DAE58C867517751E4B4F
```
