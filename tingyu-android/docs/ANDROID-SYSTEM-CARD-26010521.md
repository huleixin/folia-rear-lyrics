# 对应系统APK的原生卡片管理链路（2026-11-02）

## 输入与证据等级
用户确认在同一台手机上音乐/外卖具有统一原生卡片形态和交互，这是产品行为证据，予以采纳。静态结构不再处于“没有系统APK”的状态。
用户提供xmbp.apk：com.xiaomi.subscreencenter，versionName RELEASE-1.0.2601052145，versionCode26010521，SHA-256 9fd3b56552457102d8777045d1f0b30a11d1cf9b7670c9675468167094214e71。Manifest min/target35，编译SDK34；这不是设备Android版本。本机adb devices为空，无法将包管理器输出与手机当前安装包再次比对，也未取得split清单；不把这称为APK不可分析。
JADX1.5.6全包导出结束有13项错误，不能称全部方法还原成功。下列关键方法已读到实现；另以--rename-flags none直接从原APK导出SmartAssistantPanel、r2.r、Z1.s0，确认反射字段是原始i/n/p/b/x等，不能使用JADX自动生成的f8179n别名。私有APK/反编译文件/模板仅放工作区work-native-card-audit，不提交公开仓库。

## 已找到统一系统链路
- SubScreenLauncher.onCreate查找smart_assistant_panel，将SmartAssistantPanel交给MainPanel。
- 系统Z1.T持有Z1.V（SmartAssistantManager）。V.f(String,Bundle)创建/更新unified.music:music_media条目，包unified.music、business music、优先级500。n2.c.e构造Bundle：creator_package记录真实音乐App，media_data保存其媒体数据。不能用unified.music包名替代creator判断。
- n2.a业务映射同时包含音乐与foodDelivery，分别装载smart_assistant/music、smart_assistant/food_delivery模板。外卖经通知business解析进入同一管理条目体系。V维护列表、显示索引和变更通知，不是MAML自己管理卡片列表。
- SmartAssistantPanel构造创建assistant_card_container及3个FrameLayout卡槽（Z1.s0），列表raw字段i；中心为索引1。
- SmartAssistantPanel.n(int,int,int,int,Runnable)创建r2.r对应Widget，将Widget.p指向holder.a卡槽；Widget.z(Context)生成实际View n并放入p；绑定完成后holder.b=Widget。
- 两类模板经r2.j(NotificationMamlWidget)→r2.g(MamlWidget)→r2.f(MamlView子类)。r2.j.J把business/媒体Bundle/通知参数送入MAML。
- r2.g.r(Context)设置MamlView.Config.viewWidth/Height为屏幕Point，父布局MATCH_PARENT。**系统音乐/外卖卡片本身就可能采用整屏尺寸的MAML坐标画布；因此尺寸既不是“假卡片”的充分证据，也不是“原生卡片”的充分证据。**
- Widget.z给内容设置系统OutlineProvider与clipToOutline，r2.q负责圆角；SmartAssistantPanel自己也管理容器裁剪、背景、页码、底栏和动画。模板music的背景Rectangle按view_width/height绘制，music_control位于viewMarginLeft的Group内部；food_delivery同样有全尺寸背景。不可未经证据把music_control几何当Android内容容器。
- r2.r.C/D/A分别负责暂停、恢复、销毁；r2.g.v/w/s调用MamlView.onPause/onResume/onDestroy。

## 切换、退出与恢复
SubScreenLauncher.dispatchTouchEvent先交给c2.l（原始名以APK为准）的系统手势调度；成功识别后给内容发送ACTION_CANCEL，自己消费后续手势。SmartAssistantPanel注册Z1.v0与Z1.r0。
Z1.r0负责卡片切换：旋转3个s0复用槽、更新当前索引和PageIndicator，通过holder.c/b/d驱动Widget的恢复/暂停，再由SmartAssistantPanel.w/n换入对应业务内容。
Z1.v0负责面板展开/收起，移动assistant_container，C(boolean)通知V的active状态与索引保存。音乐/外卖共用此机制。后续不应添加独立的导航或手势模拟替代这些类。
这部分已是系统源码证据；真机对应手势的方向、阈值和视觉结果仍需现场验收，不用静态分析冒充操作录像。

## Folia对照与正确接入位置
FoliaHook.install只向已经存在的音乐MamlView插入MATCH_PARENT的RearCardView，NativeMusicCard管理原绘制接管/恢复。其没有创建SmartAssistantPanel，也不另造manager条目。这可以沿用原生管理体系，前提是目标MamlView确实属于系统管理的music Widget。
听屿之前仅查root.findElement("music_control")、MediaController与可见尺寸；它没有证明这个前提。本轮把接入口落实为：
SmartAssistantPanel → i[1](s0) → b(Widget) → p(原生卡槽) / n(原生内容MamlView)。
只有Widget.Bundle为package_name=unified.music、business=music、creator_package=听屿，holder与Widget及MamlView父子身份完全一致，面板处于active，才允许复用该内容容器渲染舞台。不是把WebView塞进任意全屏MAML。
**这补全了真实系统条目归属，仍不等于已经完成用户要求的小卡片形态。** 如现场形态仍不符，需对比原卡与替换后的同一个slot和模板可见区，进一步确定内容/装饰边界，不能仅凭该门禁宣布通过。

## 实际代码修改
- RearSystemCardBinding：独立实现的只读系统profile适配（限定26010521），核验panel/holder/widget/content身份，记录有界父链、尺寸、alpha、clipOutline，不读取通知正文/其他App歌曲。
- 同类Hook真实SmartAssistantPanel.n签名，after成功后通知既有合并重校验队列。原因：Widget.z引发MAML附着时holder.b尚未赋值，绑定后才是正确查询时机。这是已从源码确认的顺序。
- RearMamlProbe.ownCard必须先取得上述binding；探测增加systemSlot阻塞原因。
- RearNativeCardOwner.acquire再次核验binding，防卡槽重用的过期接管。
- RearHostView.reconcile只有系统仍将本内容作为中心music条目时显示；原父级尺寸/Outline/布局/导航保留。没有新建替代父容器、手工缩放或圆角。
- RearHostHooks复用原有单个待执行任务进行绑定事件重校验；不增加轮询、不重做Binder/ready/AOD/同步。
- RearSystemCardPolicy与JVM测试涵盖其他App、外卖业务、未绑定、非中心槽与面板未激活的拒绝。
私有APK只用于方法/字段行为研究，新增代码独立实现，不复制系统方法、模板、资源或第三方反编译代码。

## 边界及交付
没有改版本号、构建签名或发布Release。未知ROM profile明确拒绝接管并保留独立窗口备用；没有强制创建业务条目、唤起面板或接管其他App。
本轮执行: :app:testDebugUnitTest共895项通过，失败/错误0；:app:assembleDebugAndroidTest编译通过但未在设备运行；git diff --check通过。未改前端，不重复运行前端视觉测试；未构建/发布Release。没有真机，尚不能验证新代码取得实际中心音乐槽、系统上滑/切换是否保持完整，以及是否出现用户期望的原生小卡片视觉。
后续现场：先仅用系统原卡确认music/foodDelivery的切换；播放听屿启用后应出现system music entry verified、centerSlot=1、creator=Tingyu和真实父链；created为system-music-slot content。配合手机画面验收卡片形态/切换/退出/返回。若profile或父链拒绝，按实际日志修正，不把hostActive当成验收。
