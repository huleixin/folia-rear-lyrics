# 澎湃原生背屏小卡片接入调查（2026-11-02）

> 后续证据更新：用户已提供对应背屏中心APK，并确认音乐/外卖在同机具有统一交互。已找到SmartAssistantPanel、系统音乐条目、三卡槽与共同手势链，详见[对应系统APK调查](ANDROID-SYSTEM-CARD-26010521.md)。下文“缺少系统APK”为当时调查条件，已不再成立。

本轮基线 `c44a342d6b03ead8e8af47e659d9684ddaccbb60`，版本保持1.3.105 / versionCode128。用户最新验收以真实系统小卡片布局、切换、退出、返回为准。本轮不发布版本、不改播放/歌词/AOD/手势/窗口恢复，不把ready当成小卡片完成证据。

## 结论

当前实现证明了“替换一个包含music_control的MAML场景绘制”，没有证明“接入澎湃系统小卡片管理”。用户报告MediaController和首帧已成功，但实际不是小卡片，与这个代码缺口一致。当前证据不足以确定Android17正确的小卡片接入口；不实施猜测性的缩放、圆角、坐标裁剪或模板注入。

Folia0.3.2同样把RearCardView填满既有MamlView，没有在已核实链路中注册新的业务卡片、创建系统卡片管理器条目或指定小卡片尺寸。因此照搬其install方法不能保证本机出现目标形态。此结论只限定所检查调用链，不代表Folia真机没有小卡片体验，也不能反推HyperOS不支持。

## 证据与复核方式

- 原APK本轮重新计算SHA-256：`42e7fa3df4d4edaf3ae98975d58dc4d8bc7e7c46f3de92bd327c8ec8558a244e`，大小47,261,243字节。
- 读取精简包README、既有JADX结果和索引；使用JADX1.5.6直接对原APK以fallback模式重新导出FoliaHook，核对install中的原始指令表示。局部研究文件位于工作区work-native-card-audit，不加入公开源码。
- FoliaHook正常反编译第295–307行：验证附着/背屏，mRoot.findElement("music_control")和元素类型，构造NativeMusicCard及RearCardView，然后host.addView(..., LayoutParams(-1,-1))。
- fallback输出install中同样是取mRoot、findElement、new LayoutParams，宽高两个参数均为-1，再r7.addView。不是仅凭反编译类名判断。
- RearCardView第496–523行：EngineView按本View测量尺寸EXACTLY，layout为0,0,getWidth(),getHeight()，没有从系统卡片管理器申请尺寸。
- NativeMusicCard第67–133行：setOwned暂停该root/selfPause、detachFromVsync、隐藏非RearCardView子View；释放时恢复原可见性、VSync、媒体状态和requestUpdate。它管理绘制所有权，不是业务卡片注册器。
- RearCardView.dispatchTouchEvent第755行起处理短点击、拖动门控和控件显示；没有此处主动调用系统卡片返回/选择页的方法。FoliaHook将被接管root的onTouch/onHover置false。系统父层如何导航仍需系统实现或运行证据。

## 与听屿的逐项对应

| 层次 | Folia已证实行为 | 听屿当前行为 | 尚缺的证据/能力 |
|---|---|---|---|
| 媒体来源 | HostMedia读取宿主Controller，可按来源包查询活跃会话 | 要求MAML选中听屿，现有播放链供词/供时钟 | 媒体身份正确不能证明卡片布局正确；本轮不继续改此层 |
| MAML内容发现 | FoliaHook查找music_control | RearMamlProbe.ownCard同样查找 | music_control是ScreenElement，不是已证明的Android小卡片View |
| 容器 | install向传入MamlView添加MATCH_PARENT内容 | RearHostView使用card.container，stage和WebView均MATCH_PARENT | 没有验证该MamlView是小卡片内容槽还是整屏场景画布 |
| 系统布局 | RearCardView继承父尺寸 | RearLyricsViewportMetrics.fit仅把父尺寸与物理屏幕相交 | 没有系统业务卡片ID、模板ID、卡片边界、折叠/展开状态绑定 |
| 绘制接管 | 暂停/恢复整个目标root和原子View | RearNativeCardOwner采取相同范围的绘制接管 | 若root包含多项内容，当前暂停范围可能超出音乐卡片；不能把存在music_control当充分证明 |
| 导航/手势 | 自身处理点击，外层系统行为未包含于所查代码 | 允许父层intercept，观察pause/detach分类退出 | 没有证明卡片条目在系统选择器中，或系统小卡片切换/返回管理器参与 |
| 失败回退 | failOpen恢复原绘制 | 保留独立Activity安全回退 | 独立窗口只算回退，不算目标实现 |

源码定位：RearHostView.java的card.container、group.addView(stage,(-1,-1))；RearMamlProbe.java的ownCard；RearNativeCardOwner.java的acquire/restore；RearLyricsViewportMetrics.java的fit；RearLyricsViewportGeometry.java的fit。

目前mayMount仅验证包名、附着、可见性、目标display、正尺寸；没有验证小卡片管理归属。904x572既出现在既有MAML诊断，也出现在独立窗口safe viewport中，这只能表明两者记录了相同尺寸。不能单独由此证明MAML是整屏，也不能证明是系统小卡片，仍缺物理屏幕/祖先链/模板局部坐标的同帧对照。

## Janus：业务卡片与音乐绘制替换是不同层次

本轮重新读取远端main的递归tree，SHA仍为`27e28314d7daad4a63e7f7053abb6cd478e61ce1`。已核对LICENSE为GPL-3.0；只研究具名机制，没有复制实现或模板。APK没有提供已确认的源码复制授权，不复制反编译代码。若后续引入Janus受保护代码，须保留相应署名、许可及修改来源，不能把“研究了机制”当复制授权。

公开源码：
- [SystemCard枚举](https://github.com/penguinyzsh/janus/blob/27e28314d7daad4a63e7f7053abb6cd478e61ce1/app/src/main/kotlin/org/pysh/janus/data/SystemCard.kt)：music、foodDelivery为不同business。
- [CardInjectionEngine](https://github.com/penguinyzsh/janus/blob/27e28314d7daad4a63e7f7053abb6cd478e61ce1/hook/src/main/kotlin/org/pysh/janus/hook/engine/engines/CardInjectionEngine.kt)：注册业务/模板映射，捕获manager，构造携带miui.rear.param的Bundle并在其Handler上执行卡片Runnable，参与条目排序。这是进入业务管理层的具体证据。
- [注入规则](https://github.com/penguinyzsh/janus/blob/27e28314d7daad4a63e7f7053abb6cd478e61ce1/hook/src/main/assets/rules/subscreencenter_card_injection.json)：该版本映射p2.a/p2.c、Z1.d0、Z1.c0、Z1.m等。
- [SystemCardEngine](https://github.com/penguinyzsh/janus/blob/27e28314d7daad4a63e7f7053abb6cd478e61ce1/hook/src/main/kotlin/org/pysh/janus/hook/engine/engines/SystemCardEngine.kt)：非音乐业务通过business→模板路径替换，明确将音乐交给MusicTemplateEngine。该固定tree没有MusicTemplateEngine实现；不得补猜其调用链。
- [LICENSE](https://github.com/penguinyzsh/janus/blob/27e28314d7daad4a63e7f7053abb6cd478e61ce1/LICENSE)。

可确认Janus把两类业务放在其系统卡片配置抽象中，并给出了业务管理/模板接入路径。不能确认当前Android17的小米系统中，音乐和外卖使用同一个布局容器、同一导航栈、同一模板装载方式；这需要实际系统APK交叉引用与视图树验证，Janus的混淆名不是当前ROM已验证API。

## 真正缺失的宿主调查

当前工作区有Folia APK和资料，没有找到本设备对应版本的com.xiaomi.subscreencenter APK及music/foodDelivery模板；adb devices无设备。Folia模块APK不包含小米系统宿主的完整实现。这里是缺少分析输入，不是已证实的HyperOS技术限制。

需以同一设备/版本获取下列证据（优先电脑连接后只读采集，或用户提供包与结构资料；不要求发布新探测APK）：

1. 背屏中心的versionName/versionCode、base和所有split APK；系统更新后类/资源可能变化，必须对应真机版本。
2. 实际使用的music和foodDelivery模板资源及manifest.xml；若资源不在APK内，按真实路径只读取得，不猜路径写文件。
3. 不启用听屿接管时分别查看：系统外卖小卡片、音乐小卡片、音乐展开态；记录MamlView、InnerView及祖先链的类/资源ID、测量/布局/屏幕可见矩形、裁剪、变换和display尺寸。启用后的状态做同条件对照。普通UIAutomator可能看不到MAML内部ScreenElement，届时结合Layout Inspector/受限只读实例采样，不能把空XML当没有卡片。
4. 追踪创建MamlView的调用方、业务条目插入/移除、模板装载、绑定媒体与父容器方法；反查实际manager、item、adapter/容器及音乐的选择/折叠/展开路径。
5. 对music_control读取局部/绝对几何、root缩放、屏幕元素父链，确认它是画布内部的小区域还是整场景；ScreenElement并非普通Android View，不能直接把它当ViewGroup.addView目标。
6. 在原生卡片上操作切换、上滑、返回，核对触摸从Window→系统父容器→MamlView/root/ScreenElement的实际分派与导航状态变化；不自行添加返回手势。

## 依据调查结果才能选择的接入方案

- 若系统已给出独立的音乐小卡片内容容器：关联manager中的music条目、模板和容器实例，在内容槽内复用现有舞台，由父级提供尺寸、位置、切换和退出。
- 若MAML只是全场景画布，小卡片由模板ScreenElement坐标及管理器控制：先定位真实业务条目和模板的内容承载机制；确认可嵌入Android View的槽位或系统接受的内容扩展点，才适配完整舞台。单独裁剪到music_control矩形仍不能证明参加系统卡片导航。
- 若没有既存听屿条目、但真实管理器支持注册：参照Janus业务登记→模板→entry/runnable→系统布局的顺序，严格限定听屿；必须确认不会建出另一个全屏场景，也不能将“发一个业务通知”当完整歌词舞台接入。
- 若实际宿主无可承载完整舞台的入口：提供对应方法签名、调用与实测障碍后报告限制。独立窗口可继续作为明确标注的备用方案，但不作为本任务验收。

## 本轮交付与后续验收

只新增调查文档并纠正上次报告的完成状态。没有变更运行代码、配置、版本、签名或任何Release，也没有重复运行无关测试/构建。文档检查包含源码定位、APK哈希、JADX直接APK fallback复核、Janus固定commit和tree/方法核查、git diff --check。没有真机卡片验收结果。

验收必须同时包含：系统管理器中对应听屿的卡片条目证据；该条目实际控制的布局/模板/容器链；手机呈现原生小卡片而非整屏画布；按系统机制切换/退出/返回；现有完整舞台与播放状态正确。hostConnected/hostActive/ready均仅作为传输与绘制事实，不可替代此验收。
