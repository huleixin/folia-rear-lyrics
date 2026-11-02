# 1.3.108卡槽已发现但身份条件混用
用户诊断20261102-235506确认当前1.3.108会话center=true、panelActive=true、own=1，仍返回system slot not eligible并回退独立Activity。日志没有分别输出pkg/business/creator/bound，不能由此证明哪一个具体字段为空。此前将四个条件压成一条日志是不足。

复核实际系统APK：E2.w.g的type0分支创建E2.j普通MamlWidget，将x2.a.d(可空)赋给widget.i；type2才创建E2.n通知MAML并接收unified.music/music/creator_package字段。MainPanel使用普通主题组件时，不能要求它具有通知业务卡片字段。旧版r2.r亦有相同type0与type2分支。FoliaHook.install则依据真实music_control挂载，没有要求通知业务字段。该机制可借鉴，完整歌词渲染仍用听屿原舞台，不复制未授权反编译源码。

本轮独立实现themeMusic策略，仅限：
- 已验证MainPanel中心卡槽，面板active，holder/Widget/父槽/content为同一实例链。
- Widget类型0（普通主题MAML），内容真实MusicControlScreenElement提供已选中的听屿MediaController。
- 通知字段允许缺失；如果出现明确的其他应用、非music业务或矛盾包名，仍拒绝。
原通知卡片路径不变，媒体失去听屿归属后现有owner仍释放。没有对任意MAML开放接管，也没有采用“只要有music_control就成功”的条件。

诊断改为逐项记录active/center/bound/widgetType及pkg/business/creator/selected为absent/expected/other，不输出其他应用歌名或通知内容。成功信息使用selected=Tingyu，不再在creator缺失时谎称其字段存在。

自动化覆盖主题路径无通知数据/实际Controller归属/非type0/旁槽/面板暂停/过期父子链/冲突业务或来源。此修复针对有代码证据的条件混用；真机实际字段与原生卡片形态仍待验证，不能把相关单测或构建作为完成验收。
