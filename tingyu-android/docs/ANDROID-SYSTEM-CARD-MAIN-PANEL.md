# 1.3.107 真机：遗漏MainPanel卡槽路径
日志20261102-234220确认构建1.3.107@28f42a44、原生媒体归属own=1、profile已不再拒绝，但挂载阻塞MAML has no SmartAssistantPanel ancestor。没有created/page-ready，最终RearLyricsActivity独立回退。日志含历史旧版本记录，本结论只依据当前会话295331984起的事件。

系统APK复查确认：SmartAssistantPanel之外，MainPanel也创建并复用三个原生卡槽，使用同一Widget体系但不同holder/绑定方法。旧适配把SmartAssistantPanel作为唯一祖先属于过度限定。日志只能直接证明没有该祖先；当前实际父链是否MainPanel仍待本次运行验证，不能把静态路径当真机已命中。

|版本|面板|绑定方法签名|holders|holder条目/内容槽|holder类型|active|
|---|---|---|---|---|---|---|
|26010521|SmartAssistantPanel|n(int,int,int,int,Runnable)|i|b/a|Z1.s0|x|
|426091419|SmartAssistantPanel|y(int,int,int,int,Runnable)|i|b/a|k2.o0|x|
|26010521|MainPanel|q(int,int,boolean,int,Runnable)|j|e/b|Z1.x|p|
|426091419|MainPanel|t(int,int,boolean,int,Runnable)|k|e/b|k2.y|q|

新版MainPanel.t在Widget.z创建内容后赋holder.e；MainPanel.G调用t填充中心及相邻卡槽，holder所属、中心索引、widget.n/p、Bundle.i仍可验证。旧版MainPanel直接从原APK --rename-flags none重导，核实q和j/p字段，不使用JADX合成别名。MainPanel自行维护切换、恢复和编辑状态，k2.y保留系统框架/内容槽；新增路径不自己创建容器或修改系统尺寸。

代码：RearSystemCardProfile增加两版MainPanel映射；Binding按真实祖先选择档案，分别核验方法参数（boolean vs int）、holder类型、字段与父子对象身份。after绑定事件同样复用原合并任务。找不到任一已验证面板时补记有界真实父链，不放宽为任意FrameLayout。依旧要求unified.music/music和听屿creator与选中Controller，不接管其他业务/应用。未改播放、同步、AOD、独立回退。

自动化新增MainPanel/SmartAssistantPanel档案隔离与签名/字段测试；全量JVM和仪器测试编译通过，具体数量见发布说明。无设备，MainPanel真机命中、原生小卡片形态与导航需要用户验证。
