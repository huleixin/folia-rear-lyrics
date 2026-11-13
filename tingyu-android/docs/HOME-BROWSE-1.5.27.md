# 1.5.27 / 242：推荐卡浏览入口修复

2026-11-13。

## 修改

- NativeHomePage.kt：去除推荐卡 CTA 的胶囊边框、底色和内部横向留白；文字与说明左对齐，右侧小箭头，说明下方预留间距。整张卡仍打开列表。MobileRecommendations.tsx 和 mobileRecommendations.css 同步入口样式。
- libraryHomeActions.ts：移除 openOnlineCard 的私人 FM 即刻播放分支。猜你喜欢统一描述为 personal_fm / radio 集合，由已有 onlineCollectionResource 通过 Omni 读取推荐批次；打开列表不调用播放端口。
- createLibraryPlaybackPort.ts、GridViewOverlayHost.tsx：只有用户在私人 FM 集合中点击歌曲或播放全部时，才传递现有 isFmCall 标记，保留电台续歌。普通集合仍走原播放路径，空批次不播放。显式“播放私人 FM”动作仍可正常使用。
- homeModel.ts、homeCards.ts：更新浏览动作的注释说明。

## 验证

- 类型检查通过。
- 5 个 Vitest 文件共 71 项通过：三张卡仅进入集合、不请求自动播放；真实首页动作层 FM 集合分支不触发播放；既有资源读取 FM 批次；主动播放歌曲/整批才进入 FM；原本显式播放 FM 动作继续有效。
- Robolectric 实际 Compose 推荐轨道截图和点击测试通过，验证 CTA 与说明左边界对齐、垂直间距、一次点击只调用一次浏览动作。截图在 android/app/build/screenshots/home/hero-browse.png，已人工查看。
- 资源同步与 Release 构建、签名检查见预发布交付结果。

没有连接手机或访问用户真实 QQ 会话；真实账号的推荐返回、点击后电台持续续歌及系统表现仍需覆盖安装确认。先前测试只模拟了页面层回调，没有覆盖底层 FM 直播放分支；本次补上动作层与播放端口测试。
