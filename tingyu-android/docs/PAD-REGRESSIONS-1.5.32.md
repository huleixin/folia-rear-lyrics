# Pad 与手机回归修复 1.5.32

分支：feat/tablet-adaptive；基线 f76b7e71；versionCode 247。未合并 main。

## 修改与原因

| 反馈 | 代码与修复 |
|---|---|
| QQ 歌单只有封面、歌曲一直加载 | src/nativeBridge/api/qq.js：旧补充流程同时发出 48 个详情请求，且在它们全部完成后才返回歌曲。改为真正最多 4 个并发，歌单和搜索候选的补充等待上限 1200ms，超时返回已取得的基础数据并取消请求；保留上游已有音质/权限信息。 |
| 搜索页持续转圈 | SearchLanding.tsx：热门搜索请求 8 秒后释放 pending 槽并显示重试。历史和输入独立保留，迟到响应不能覆盖新结果。不制造热门搜索。 |
| 取消后原生请求仍占队列 | nativeAndroidBridge.ts / FoliaNativePlugin.java：请求身份、AbortSignal、原生 Call.cancel，以及包含排队时间的请求总时限。超时日志不再输出完整带鉴权参数的 URL。 |
| Pad 设置拖影、样式字体进入错误界面 | SettingsModal.tsx：Android 大窗口仍按原生设置页面语义生成编辑器，而不是进入桌面弹窗分支。SettingsFlowPage.kt：完整窗口绘制底色和采样源，仅为内容预留侧栏空间，避免外边缘漏出旧页；保留实时预览的透明裁剪孔。 |
| Pad 极简页缺少完整舞台入口 | MinimalPlayerScreen.kt：双栏歌词可见时也显示原来的“打开完整歌词舞台”按钮，继续调用既有路由动作。 |
| 侧栏图标不一致、推荐图标空白 | PadNavigation.kt：使用手机已有 GlassNavIcons 原始 SVG、主题和选中状态资源。 |
| 歌单左右背景断层 | MediaDetail.kt / NativePageView.kt：双栏详情采用与目录一致的背景，避免封面模糊氛围层在分栏边界硬切；独立详情保留原有氛围。 |
| 手机迷你条无法点击 | nativeChrome.ts：隐藏祖先、display:none、inert 等不可见弹层不再阻止原生点击。ChromeMaterial.kt / ChromeMiniPlayer.kt：长生命周期手势读取最新业务回调。useComposeChrome.ts：拒绝事件记录原因并重新同步；session 和歌曲身份检查保留。 |

## 验证

前端定向回归：41 个文件、418 项通过，包含 QQ provider/transport、搜索、设置返回、页面归属、HTTP 取消与迷你条弹层判断。类型检查通过。

Android 全量测试：1362 项通过，0 失败、0 跳过；包含新增手机迷你条实际 Compose 触摸测试、Pad 完整舞台入口点击以及既有预览裁剪/设置触摸/播放与歌词状态回归。Release 构建结果见随包测试证据。

新增自动化覆盖：慢详情仍返回 100 首歌、最多 4 个请求及取消；热门搜索超时后重试、旧结果不能覆盖；原生 HTTP 取消；隐藏弹层不阻止点击；手机迷你条歌名/播放/队列真实 Compose 触摸及回调替换；Pad 完整舞台入口点击。

## 实际验证边界

没有已连接的 Android 真机或车机，未验证用户 QQ 登录账号的真实请求结果、真实网络与 OEM GPU 拖影。Compose/Robolectric 截图和触摸属于自动化环境，不等于真机端到端验收。设备安装后重点复核：QQ 私有与收藏歌单、搜索、反复进入/返回设置、手机迷你条、Pad 舞台样式字体、三套主题及旋转。

已修复确定的阻塞、错误页面分支、漏底与陈旧回调缺陷；用户设备上的全部现象是否消失仍需真实复测。慢网下未在补充预算内取得的杜比/DTS 等标签暂不显示，已有标签与播放音质不会被猜测或伪造。设置玻璃 GPU 残影若仍复现，需要新包诊断确认设备合成路径。
