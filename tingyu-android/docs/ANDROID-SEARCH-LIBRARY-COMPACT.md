# Android 搜索与资料库入口精简

正式 UI 仍由 Compose 绘制；React 只提供 NativePage 模型和动作。Haze 参数、32dp 衰减、测量高度保护、Kyant0 底部玻璃与输入法显示规则不变。

- 搜索音源仍由 `sources` section 提供数据，但只在 `NativePageInput` 右侧绘制一个菜单；不再生成独立标签行。可用宽度不足 280dp 时采用带完整无障碍名称的图标入口，其他宽度显示当前来源和箭头。保留同一个 BasicTextField，组合输入和 IME submit 没有更换实现。
- 全局来源继续由 `useHomeSourceStore`（online/local）、既有 homeViewTab（含 navidrome）和当前 provider 决定，不新增持久化状态。`resolveHomeSearchSource` 提供默认值，`selectHomeSearchSource` 对齐既有搜索/浏览状态。在线 provider 切换走已有账户 controller 的确认/清理，取消不改变来源。
- 资料库在线分类仅保留支持且未被设置隐藏的歌单/电台/专辑；本地和 Navidrome 从全局来源进入，各自分类、连接状态、数据、筛选、排序和操作保持原有 owner。切换到不支持当前内容分类的平台时，使用其首个可用分类。
- 本地页顶部保留“本地音乐”音源出口及独立紧凑“更多”按钮，后者继续打开原导入/刷新工具面板；不会因移除本地分类 Tab 而丢失入口。Navidrome 标题显示自身来源。
- 热搜默认仍截取前 10 条；数据缓存、排序和关键词动作不变。标题右侧“查看更多/收起”使用既有 hotExpand 动作和显式 expanded 模型字段，箭头与列表高度用 220ms 动画；列表底部不绘制独立胶囊。
- 搜索顶栏初始估计从实际搜索行和可选结果分类行推导；前景 Column 的真实布局底边继续传给 `glass.reportHeader`。移除来源行后没有相应占位；结果分类出现/消失均重新测量。首个内容继续保留原 32dp Haze 衰减与列表间距。
- 滚动区域仍使用 imePadding 和既有 `LocalNativePageBottomPx`，热搜末条、普通搜索末条与设置页底部避让由真实 Compose 滚动测试覆盖。

自动化包括源状态往返、账户确认/取消、热搜展开收起及次序、本地/Navidrome 模型与入口，以及 Robolectric NATIVE 图形栈上的生产 Compose 页面：320dp 输入宽度、菜单、文本输入/IME submit、热搜标题操作、顶栏动态测量、深浅主题本地工具/搜索层和末项底部避让。

Robolectric 的焦点与 IME action 测试不等于设备软键盘动画或厂商 WindowInsets 验收。真机仍需验证输入法组合输入/弹出/收起、底栏显示规则、热搜滚动动画、浅深色玻璃实际效果以及真实在线/Navidrome 服务连接。
