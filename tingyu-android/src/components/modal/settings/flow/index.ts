import type { TFunction } from 'i18next';
import type { NativeSettingsFlow } from '../../../../types/nativeSettingsDocument';
import { buildGraphicsFlow } from './graphicsFlow';
import { buildGeneralFlow, canUseGeneralFlow } from './generalFlow';
import { createFlowBuilder, toFlow, type FlowHandlers } from './flowBuilder';
import type { FlowBuilder } from './flowBuilder';

// src/components/modal/settings/flow/index.ts
//
// 设置分区 → 语义化模型的注册表（原生化专项·第 22 轮）。
//
// 只有出现在这张表里的分区才会交出「声明式页面」，其余分区继续走原来的
// 「DOM 测量 + Canvas 复刻」。迁移因此是**逐分区**的：
// 改一个分区、提交一次、可单独回退，不影响其它分区。
//
// 三个分区在 Android 上没有内容（DOM 版本自己 return null 或被 isElectron 挡掉）：
//   interaction（isAndroidNativeRuntime → null）
//   desktop    （isElectron 才有）
//   mods       （isElectron 才有）
// 它们也登记在这里，用空页面取代「测量一棵空 DOM 树」，语义上更准确。

export type SettingsFlowResult = { flow: NativeSettingsFlow; handlers: FlowHandlers };

/** 分区标题与说明：与 WebView 版 SettingsSectionHeader 用同一份 navModel 文案。 */
export type SettingsFlowContext = {
    t: TFunction;
    title: string;
    subtitle: string;
};

/** Android 上内容为空的分区：交出空页面而不是空测量。 */
function emptyFlow(section: string, title: string, subtitle: string): FlowBuilder {
    const b = createFlowBuilder(section, title);
    b.note(subtitle);
    return b;
}

/**
 * 构建当前分区的语义化页面。返回 null 表示该分区尚未迁移（继续用测量路径）。
 *
 * 这是唯一入口：新增一个分区只需在这里加一行，不需要改 SettingsModal。
 */
export function buildSettingsFlow(section: string, ctx: SettingsFlowContext): SettingsFlowResult | null {
    const { t, title, subtitle } = ctx;
    let builder: FlowBuilder | null = null;
    switch (section) {
        case 'graphics':
            builder = buildGraphicsFlow(t, title);
            break;
        case 'general':
            // 条件子组（库套件选择 / Bravais 外观）没有建模时整页回落测量路径。
            if (!canUseGeneralFlow()) return null;
            builder = buildGeneralFlow(t, title);
            break;
        case 'interaction':
        case 'desktop':
        case 'mods':
            builder = emptyFlow(section, title, subtitle);
            break;
        default:
            return null;
    }
    return { flow: toFlow(section, title, subtitle, builder), handlers: builder.handlers };
}
