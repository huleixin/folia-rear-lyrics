# 1.3.111：动态通知与便利贴的音乐业务卡片

本轮只修正 LSP 卡片接入位置、音乐业务准入及收起后的显示会话；播放、歌词时钟、舞台视觉、Shizuku、相机和 AOD 策略不变。

## 已确认的偏差

1. 1.3.110 日志的 `host/created` 明确记录 `panel=com.xiaomi.subscreencenter.MainPanel; bind=t`。这是主题/表盘页的内容，不是用户截图中的“动态通知与便利贴”。首帧成功并不能证明接入了正确的产品区域。本轮移除 MainPanel 准入，不能再用主题 MAML 的空业务字段替代真实业务卡片身份。
2. `RearMusicAdmission` 仍找 `p2.a.c(String)`。用户当前背屏中心 426091419 的 `p2.a` 是手势基类；实际音乐业务准入位于 `A2.a`。此前只扩展 MAML 音乐包列表，不能让动态业务管理器接纳听屿。
3. 原来的启动完成条件只接受可见舞台首帧。真正的系统业务可能已经存在、但面板处于收起状态；把这种情况当作首帧超时，会释放宿主并错误地回退独立窗口。
4. 原恢复预算对整个显示会话累计，正常导航重建也消耗预算；成功显示后不归零，反复切换最终可能耗尽。首次绑定也可能早于非零布局尺寸，原先只能等待下次事件/探测。
5. 系统首次创建音乐业务时，`A2.g.s` 会把 `creator_package` 归一化为 `unified.music`，真实播放器身份仍在 `media_data.packageName`。后续同源业务更新才可能使用应用 creator；原来的单字段身份判断会误拒绝首次建卡。旧版 `n2.c` 也有相同的归一化。

## 系统结构证据

静态分析来自用户提供的系统 APK，不依赖网上同名版本：

| 项目 | 26010521 | 426091419（用户当前版本） |
| --- | --- | --- |
| 动态卡片面板 | SmartAssistantPanel | SmartAssistantPanel |
| 绑定方法 | n(int,int,int,int,Runnable) | y(int,int,int,int,Runnable) |
| 业务管理器 | Z1.V | k2.V |
| 音乐准入 | n2.a | A2.a |
| 业务记录 Bundle 字段 | Z1.U.k | k2.U.l |
| 实际持有者/内容基类 | Z1.s0 / r2.r | k2.o0 / E2.w |

当前系统 APK SHA-256：`84bc2c0d9bba9f70acf69be803914ffb9b4100b98d6326a74aa5502772dce371`。

当前系统调用链：

`F2.g.onTransact(topMediaDataChanged)` → `C2.E.run(case 16)` → `A2.a.c(packageName)` → `A2.g.k`（尊重系统音乐开关）→ `k2.V.f` → `unified.music:music_media` → `k2.V.e/C` → `E2.z` 的业务列表通知 → `SmartAssistantPanel.e/y` → 原生 holder / widget / MAML。

外卖业务也进入 `k2.V` 的业务列表，再交给同一个 SmartAssistantPanel 的布局与导航。不是根据 MAML 尺寸推断卡片身份。

原生收起路径由 SmartAssistantPanel 注册的手势管理器及 `k2.r0` 驱动；完成后调用 `k2.V.j` 保存索引并暂停中心 holder，不删除音乐业务。再次展开走 `k2.V.i` 恢复索引。听屿不替换该手势、不调用手工双击退出、不强制展开面板。

Folia 0.3.2 的参考意义是：在真实 music_control 内容内部嵌入、对称暂停/恢复该实例的绘制。它不能证明听屿此前挂载的 MainPanel 就是目标区域。本轮代码独立实现，没有复制反编译代码或私有资源。

## 本轮实现

- 按已验证的两个 ROM 配置扩展**仅听屿包名**的音乐分类、包集合和 MAML 包列表。其他包返回原结果，不修改系统音乐开关，不伪造 MediaController、通知或媒体数据。
- 只读观察真实业务管理器的构造、音乐更新、展开、收起与删除；不自行建立卡片列表、不调用强制弹出、不循环重建业务。
- 只有 `unified.music / music / media_data.packageName=听屿`，creator 为系统 `unified.music` 或听屿，再加真实已选中的听屿 MediaController、原生中心 holder 关联和可见性，才允许替换歌词内容。MainPanel 无条件不准入。
- `card-available` 仅表示真实业务已登记，解除启动等待并保留显示租约；**不设置 hostActive**。收起/切到其他卡片取消首帧等待，不启动独立 Activity。再次展开才恢复现有渲染或绑定系统重新创建的真实容器。
- `ready` 仍来自真实歌词页面配置完成及可见 WebView onDraw；并非硬件呈现时间的测量。可见卡片首帧预算 4.5 秒，后续 created/probe 不能续期；收起时无绘制超时，下一次展开重新计时。
- 原生 holder 被回收或其他媒体成为选中会话时，关闭自己的内容并对称恢复原绘制；等待自己的业务重新选中，不覆盖其他音乐/外卖卡片。
- 成功 ready 后恢复预算归零，正常反复进入不累计成故障；首次非零布局补发一次检查。
- 协议 v5 拒绝手机仍驻留的 v4 主题页模块，防止覆盖安装后继续走错误路径。

新增日志只记录包名归属分类、布尔状态、索引和结构；不记录歌曲、通知内容、Token、完整媒体 Bundle。沿用已有有界导出日志。没有新增轮询或网络请求。

## 验证与边界

- Android JVM：908 项通过；包含首次建卡 creator 归一化、真实媒体包名强校验、登记/可见分离、主题画布拒绝、双版本配置、其他业务/播放器拒绝、系统音乐开关关闭、100 次收起/展开预算、旧超时与禁止延长预算。
- 前端相关测试：6 文件 44 项通过，覆盖播放权、切歌、状态中继、睡眠、背屏外观和歌词时钟。
- TypeScript 检查通过；Android 仪器测试 APK 编译通过，未在设备上执行。
- 真正的系统卡片挂载和私有 Hook 只能在目标设备验证。上述 JVM 测试不执行 HyperOS 系统管理器，也不证明实际手势或卡片外形。
- 未修改系统音乐开关。若关闭，日志应显示 `musicSwitch=false`，不能声称已登记。
- 不支持的 ROM 明确记录不兼容并走现有安全回退；不套用相邻版本的私有映射。

## 手机验收

1. 原签名覆盖安装后重启手机，让背屏中心重新加载 v5 模块；保留原 LSPosed 作用域。
2. 使用 LSP，播放听屿歌曲并开启背屏。进入**动态通知与便利贴**区域，不以主题页出现歌词为通过。
3. 日志应出现 `card-available`（ownMusic=true）、`card-selected`；`created` 的父链必须包含 SmartAssistantPanel，随后 page-ready / drawn / ready。收起时 hostActive=false 是正常状态。
4. 上滑收起，不关闭背屏开关、不暂停音乐；等待至少 15 秒，再由系统动态卡片入口进入，重复 10 次。必须仍能进入歌词卡片，不需要重新开关功能。
5. 收起期间连续切歌，重新进入应显示当前歌曲和进度。与外卖/其他卡片切换时，其原生内容不能被歌词覆盖。
6. 相机占用、锁屏/AOD、暂停恢复与原独立窗口安全回退仍需真机回归。若失败，导出诊断；`card-state` 中的 topMedia 分类、musicSwitch、ownMusic、expanded、index/retainedIndex 能区分未收到系统媒体数据、系统准入与视图阶段。

无连接设备，不能宣称真机目标已通过。本包是供上述闭环验证的测试版本。回滚可以分别 revert 本轮实现提交和版本提交；不清空用户数据。若使用旧 APK 覆盖，Android 可能禁止降低 versionCode，应以源码回滚后提高 code 重建，避免卸载丢失数据。
