# 听屿 Android 设置功能检查与后续建议

本报告是当前代码与调用链审查，不是真机可用性认证。检查一级导航以及界面、视觉、播放、交互、连接/数据、图形、实验室和开发者设置的主要接线及能力门控。没有修改下列待清理项；未逐一实测所有设备、音源、网络或系统功能。

本轮已完成：移除显示设置重复入口；手机播放页改为播放界面自动隐藏主开关控制；旧经典计时器不再争夺手机控件，快捷操作与远程状态保持一致。保留已有持久化键及经典偏好。

## 待处理清单

### 1. P1 · 自适应屏幕分辨率

当前Android主窗口的开启/关闭并不选择不同的布局策略；界面说明仍声称切换沉浸全屏。

证据：AdaptiveLayout.apply遇到MainActivity直接返回MainSystemBars.apply，未读取enabled分支。此偏好仍可能有其他窗口兼容用途，不建议删除原生类。 [AdaptiveLayout.java:49](https://github.com/huleixin/folia-rear-lyrics/blob/tingyu/settings-clarity/tingyu-android/android/app/src/main/java/io/github/huleixin/tingyu/AdaptiveLayout.java#L49)

建议：在手机版隐藏旧开关或标记由系统自动管理；保留原生兼容逻辑与历史值。

### 2. P1 · 记住主页卡片位置

当前页面未接入保存/恢复过程，开关虽能写入偏好，未找到实际页面消费者。

证据：全src检索useHomeCardPosition及useHomeCardPositionStore，恢复hook没有调用方；仅存在设置、存储和命令入口。不能把开关状态变化当成恢复已实现。 [useHomeCardPosition.ts:7](https://github.com/huleixin/folia-rear-lyrics/blob/tingyu/settings-clarity/tingyu-android/src/hooks/useHomeCardPosition.ts#L7)

建议：先为当前首页逐个列表补真实恢复测试再接入；暂不实现则隐藏入口，保留配置。

### 3. P1 · 歌单卡片样式：纯图片/拍立得

有设置和同步字段，但未找到当前渲染页面读取并应用该字段。

证据：grid3dCardStyle全src消费者为设置、store和同步；没有卡片渲染组件。它不能改变当前听屿首页或资料库的卡片。 [AppearanceSettingsSubview.tsx:928](https://github.com/huleixin/folia-rear-lyrics/blob/tingyu/settings-clarity/tingyu-android/src/components/modal/settings/AppearanceSettingsSubview.tsx#L928)

建议：当前手机版先隐藏；只有确认某布局实际支持后，才在该布局下开放。不要借此重新设计现有卡片。

### 4. P1 · 开发者：文件日志与进程内存监控

Android缺少所依赖的Electron桥接，部分开关仍能点击却不会启用。

证据：debugModule桥接只读取window.electron，缺失时回到UNAVAILABLE。开发者页的日志/内存Switch未按available禁用；模式和路径的部分控件已有不可用处理。会话内日志缓冲本身仍有效，不能整页删除。 [debugModule.ts:40](https://github.com/huleixin/folia-rear-lyrics/blob/tingyu/settings-clarity/tingyu-android/src/services/debug/debugModule.ts#L40)

建议：用同一能力检测隐藏/禁用桌面文件及进程监控部分，保留有效的会话日志，并给Android提供可用导出后再开放。

### 5. P2 · 首页和界面设置里的重复背屏/沉浸开关

两个入口控制同一状态，名称和呈现不同，容易被误认为两套功能。

证据：MobileSettingsNavigation与GeneralSettingsSubview重复渲染AndroidRearLyricsSetting、AndroidImmersiveSetting。 [GeneralSettingsSubview.tsx:238](https://github.com/huleixin/folia-rear-lyrics/blob/tingyu/settings-clarity/tingyu-android/src/components/modal/settings/GeneralSettingsSubview.tsx#L238)

建议：手机版仅保留设置首页的快捷卡片；二级入口移除或跳回同一处。桌面/其他布局继续按适用性保留。

### 6. P2 · 视觉设置里的旧自动隐藏、隐藏指针与命令按钮单独自动隐藏

与当前手机播放页主开关作用范围不同，界面没有说明。

证据：本轮手机播放页已统一到播放界面自动隐藏；旧视觉设置仍编辑经典控制栏偏好。触控手机上的隐藏指针也不是歌词隐藏。命令按钮单独设置在非手机播放页仍有作用，不能直接删底层字段。 [AppearanceSettingsSubview.tsx:693](https://github.com/huleixin/folia-rear-lyrics/blob/tingyu/settings-clarity/tingyu-android/src/components/modal/settings/AppearanceSettingsSubview.tsx#L693)

建议：手机版把旧自动隐藏行改为同一主开关的定位入口，或隐藏经典专用行；指针选项按鼠标能力放高级区，并保留经典偏好。

### 7. P2 · 实验室：常驻主窗口标题栏

桌面窗口专用功能在Android设置里仍显示。

证据：LabSettingsModal该行无Electron门控，AppShell只有usesCustomWindowChrome时才渲染标题栏；该标记来自isElectronWindow。 [LabSettingsModal.tsx:255](https://github.com/huleixin/folia-rear-lyrics/blob/tingyu/settings-clarity/tingyu-android/src/components/modal/settings/LabSettingsModal.tsx#L255)

建议：按桌面能力隐藏Android入口，不删除桌面功能或历史偏好。

### 8. P3 · 底部界面、键盘与交互控制的命名

作用对象不够明确，容易误以为能改Liquid Glass迷你播放器/底栏，或认为手机上的键盘功能全无用。

证据：PlayerBottomBarSection编辑的是播放页控制栏基线和动作槽；MobileMiniPlayer不读取这些配置。交互设置包含快捷键，外接键盘仍可能使用，因此不能以触屏为由一刀切删除。 [PlayerBottomBarSection.tsx:15](https://github.com/huleixin/folia-rear-lyrics/blob/tingyu/settings-clarity/tingyu-android/src/components/modal/settings/PlayerBottomBarSection.tsx#L15)

建议：将底部界面改名播放页控制栏，注明不影响迷你播放器；将键盘相关内容折叠为外接键盘/高级交互。

## 已排除的误判

- 资料库四分类显示开关：useLibraryHomeSources读取visibility，MobileHome实际渲染sources.tabs，当前有效。
- 音频输出设备：已有supportsAudioOutputSelection能力检测、不可用说明与按钮禁用，不能将Android不支持等同于死按钮。
- Mac全屏按钮与桌面防息屏：实验室已有平台门控，不按手机截图把它们当成当前手机的无效入口。
- Linux歌词发光兼容开关：有实际渲染消费者，默认检测明确排除Android。属于高级兼容项，不是已确认无用代码。
- 帧率限制、减少动态效果、系统歌词与背屏硬件能力：不能仅凭名称或本机无能力就删除，有效性应按对应设备和渲染路径验证。

## 建议实施顺序

1. 第一批做平台门控：隐藏Android的旧分辨率适配入口、桌面文件日志/进程监控和桌面标题栏选项；保留底层兼容代码及设置值。
2. 第二批去重和澄清作用域：背屏与自动隐藏只保留一个手机入口，旧经典控制栏设置按布局展示，明确播放页控制栏与Liquid Glass底栏的区别。
3. 第三批处理未接线设置：记住主页卡片位置和歌单卡片样式，逐项决定补功能还是隐藏。若补接线，要先明确验收行为并添加真实页面测试，不能简单把按钮改成可点。
4. 每批分别验证设置状态读写、返回路径、当前首页/资料库布局、正面播放页、背屏同步和持久化。避免一次性删字段、重置配置或改播放器核心。

当前未连接ADB设备，浏览器渲染通道仍受既有访问策略限制。后续需要Android实机确认可见入口、开关前后效果及系统栏联动，不能用本报告替代。
