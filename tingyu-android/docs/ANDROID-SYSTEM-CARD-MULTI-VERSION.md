# 两版背屏中心系统卡槽适配
本轮核对用户实际APK：versionCode426091419，versionName RELEASE-1.0.2609141923，SHA-256 84bc2c0d9bba9f70acf69be803914ffb9b4100b98d6326a74aa5502772dce371。与1.3.106真机日志一致，不再使用出厂样本冒充当前版本。

| profile | 卡槽绑定入口 | holder | Widget基类 | 管理器/手势 |
|---|---|---|---|---|
|26010521 / RELEASE-1.0.2601052145|SmartAssistantPanel.n(int,int,int,int,Runnable)|Z1.s0|r2.r|Z1.V，Z1.v0/r0|
|426091419 / RELEASE-1.0.2609141923|SmartAssistantPanel.y(int,int,int,int,Runnable)|k2.o0|E2.w|k2.V（JADX Windows输出目录K2），k2.r0/n0|

新版采用JADX1.5.6 --rename-flags none。全包导出有21项错误，不宣称全部成功；本表涉及的构造/绑定/字段/管理器方法已实际读到代码。注意Windows大小写冲突：目录K2不代表原始包名K2，package为k2。反射使用原始DEX包名。未复制私有APK反编译代码或资源进仓库。

新版与旧版均保持panel.i三个holder、holder.a卡槽/holder.b条目、widget.i数据/widget.n内容/widget.p父槽、panel.x激活状态；新版本y同样先widget.z创建并附着内容，再holder.b赋值。故分别挂对应方法的after，复用既有合并事件队列重查，不需改播放/歌词/首帧路线。
新版E2.j.r生成E2.i(MamlView)，布局仍来自系统；新版k2.V.f仍创建unified.music:music_media，A2.g.e（该目录亦可能因Windows大小写碰撞需以package为准）构建creator_package/business/media_data。现有MAML接口继续逐项能力检测，不假定版本号通过就能接管。

实现：RearSystemCardProfile独立定义两版映射；RearSystemCardBinding按实际PackageInfo版本选择，核验方法签名、holder精确类型、Widget继承链和真实panel/slot/content对象链。当前显示中心槽与听屿creator及MediaController双重身份不放宽。未知版本不按范围继承旧映射，仍明确失败并安全回退。新适配不是支持所有HyperOS；仅两份样本具备静态依据。

上次失败来自profile不支持426091419，未尝试创建歌词View便回退独立窗口。本轮消除此明确版本阻塞及错误绑定方法，不宣称真机小卡片形态已完成。

测试见发布说明：全量Android JVM和仪器测试编译，分别覆盖旧/新profile选择与未知相邻版本拒绝、原生卡片身份和当前槽门禁。无设备连接，旧/新系统实际卡片呈现、切换/退出/返回均需手机验收。独立Activity依旧只作为回退，不作为系统卡片成功。

测试包安装后重启手机，播放听屿并打开系统音乐卡片、启用歌词。导出日志应有profile=426091419、bind=y及system music entry verified；如没有，读取具体结构/身份阻塞，不仅看ready。随实际卡片画面验证系统切换、退出和返回。
