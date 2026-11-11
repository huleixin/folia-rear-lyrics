# Liquid Motion 依赖与许可证

本次没有新增运行时依赖，没有升级 Compose、Navigation、Kotlin 或引入 Tailwind 组件栈。项目原有 AGPL-3.0 许可不变。

| 项目 | 使用方式 | 许可 |
| --- | --- | --- |
| Motion for React / framer-motion ^13.4.3 | 使用项目已有依赖，AnimatePresence、motion、弹簧、减少动态效果 | MIT，Copyright (c) 2024 Motion B.V. |
| Motion Primitives | 参考 Morphing Dialog 的触发位置、连续布局、退出保留设计；未安装组件包 | MIT，Copyright (c) 2024 ibelick |
| AndroidX Compose UI/Foundation 1.10.3、Material3 1.4.0 | 使用已有原生动画、共享元素和状态 API | Apache-2.0 |

Motion 与 Motion Primitives 完整 MIT 文本放在 public/third-party-licenses/，随 APK 的 assets/public/third-party-licenses/ 分发。研究时保存的原始许可与 morphing-dialog 源码位于本目录 references/；参考源码本身保留其 MIT 归属，不作为 Android DOM 页面运行。

## 参考来源

- Motion 源码：https://github.com/motiondivision/motion
- Motion React 文档：https://motion.dev/docs/react
- Motion Primitives：https://github.com/ibelick/motion-primitives
- Morphing Dialog 文档：https://motion-primitives.com/docs/morphing-dialog
- 参考源码：https://github.com/ibelick/motion-primitives/blob/main/components/core/morphing-dialog.tsx
- MIT 许可：https://github.com/ibelick/motion-primitives/blob/main/LICENCE.md
- Compose 共享元素：https://developer.android.com/develop/ui/compose/animation/shared-elements

部分文档站访问受限时使用对应开源仓库原始源码核对；原生 API 可用性另外通过项目现有版本编译及 JVM 测试验证。
