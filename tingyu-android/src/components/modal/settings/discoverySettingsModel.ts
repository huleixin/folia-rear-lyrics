import type { NativeSettingsFlow, NativeSettingsFlowNode } from '../../../types/nativeSettingsDocument';
import {
    defaultDiscoverySettings,
    discoveryModules,
    computeDiscoverySourceOrder,
    type DiscoverySettings,
    type DiscoveryModule,
} from '../../../stores/useDiscoverySettingsStore';
import { providerLabel } from '../../../services/onlineMusic/providerLabel';

// src/components/modal/settings/discoverySettingsModel.ts
export const moduleNames: Record<DiscoveryModule, string> = {
    roam: '听屿漫游',
    shortcuts: '快捷入口',
    radars: '你的专属雷达',
    songs: '猜你想听',
    collections: '为你精选歌单',
    recent: '最近播放',
    playlists: '我的歌单',
};

export type DiscoverySourceOption = {
    providerId: string;
    displayName: string;
    loggedIn?: boolean;
};

export function discoverySettingsModel(settings: DiscoverySettings, sources: DiscoverySourceOption[]): NativeSettingsFlow {
    const group = (id: string, title: string): NativeSettingsFlowNode => ({ id, kind: 'group', title });
    const byId = new Map(sources.map(item => [item.providerId, item]));
    const orderedIds = computeDiscoverySourceOrder(settings.sourceOrder, sources.map(item => item.providerId));
    const orderedSources = orderedIds.flatMap(id => {
        const found = byId.get(id);
        return found ? [found] : [];
    });
    const sourcePayload = JSON.stringify(orderedSources.map(source => {
        const enabled = settings.enabled[source.providerId] !== false;
        const status = !enabled
            ? '已隐藏'
            : source.loggedIn === true
                ? '已登录'
                : source.loggedIn === false
                    ? '未登录'
                    : '可用';
        return {
            id: source.providerId,
            label: providerLabel(source.providerId, false, source.displayName),
            status,
            enabled,
            weight: String(settings.weights[source.providerId] ?? 1),
        };
    }));

    return {
        key: 'discovery',
        title: '推荐设置',
        nodes: [
            group('personal', '个性化推荐'),
            { id: 'record', kind: 'switch', title: '个性化记录', hint: '仅保存在本机；关闭后不再记录新的偏好', value: settings.record ? '1' : '0' },
            { id: 'includeLocal', kind: 'switch', title: '包含本地音乐', hint: '将本地曲库纳入综合推荐；独立本地模式保持不变', value: settings.includeLocal ? '1' : '0' },
            group('preferences', '推荐偏好'),
            ...(['exploration', 'crossArtist', 'familiarity'] as const).map((id, index): NativeSettingsFlowNode => ({
                id,
                kind: 'slider',
                title: ['音乐探索程度', '跨歌手探索程度', '熟悉音乐比例'][index],
                hint: ['提高未听过歌曲的推荐权重', '降低常听歌手加成，增加歌手多样性', '调整熟悉歌曲偏好强度，不代表固定队列占比'][index],
                value: String(Math.round(settings[id] * 100)),
                min: 0,
                max: 100,
                step: 1,
                unit: '%',
            })),
            { id: 'independent', kind: 'note', title: '三个参数独立生效，无需相加为100%。调整后重新生成推荐。' },
            group('sources', '综合推荐来源'),
            {
                id: 'hideUnloggedInPrompts',
                kind: 'switch',
                title: '隐藏未登录提示',
                hint: '开启后综合推荐页不显示未登录平台的重复提示与空白占位；不影响独立平台公开推荐',
                value: settings.hideUnloggedInPrompts !== false ? '1' : '0',
            },
            {
                id: 'sourceOrder',
                kind: 'sourceOrder',
                title: '推荐来源排序与显示',
                hint: '长按右侧手柄调整顺序，关闭开关可隐藏对应推荐来源。',
                value: sourcePayload,
                options: [.5, 1, 2, 3].map(value => ({ value: String(value), label: value + '×' })),
            },
            {
                id: 'resetSourceOrder',
                kind: 'action',
                title: '恢复默认顺序',
                hint: '仅恢复平台排序，不重置开关、推荐权重与账号状态',
                icon: 'rotate-ccw',
            },
            {
                id: 'openAccounts',
                kind: 'action',
                title: '音乐平台账号',
                hint: '管理各音乐平台的登录与授权状态',
                icon: 'user-round',
            },
            {
                id: 'manageSources',
                kind: 'action',
                title: '自定义音源与扩展',
                hint: '管理第三方音源脚本与外部音乐服务',
                icon: 'settings',
            },
            group('layout', '页面管理'),
            {
                id: 'modules',
                kind: 'moduleOrder',
                title: '首页模块',
                hint: '拖动把手调整顺序，开关控制显示',
                value: JSON.stringify(settings.hidden),
                options: settings.modules.map(id => ({ value: id, label: moduleNames[id] })),
            },
            { id: 'resetLayout', kind: 'action', title: '恢复默认布局' },
            group('privacy', '数据与隐私'),
            { id: 'privacyNote', kind: 'note', title: '推荐偏好仅保存在本机，不上传至新增服务。清空偏好不会删除收藏、歌单、播放历史或本地音乐。' },
            { id: 'resetParameters', kind: 'action', title: '恢复默认推荐参数' },
            { id: 'clear', kind: 'action', title: '清空推荐偏好', value: 'danger' },
        ],
    };
}

/** Validate bridge values before touching the existing persisted settings. */
export function discoverySettingsPatch(
    settings: DiscoverySettings,
    id: string,
    event: { text?: string; value?: number },
    knownSourceIds?: readonly string[],
): Partial<DiscoverySettings> | null {
    if (id === 'record' || id === 'includeLocal' || id === 'hideUnloggedInPrompts') {
        return { [id]: event.text === '1' };
    }
    if (['exploration', 'crossArtist', 'familiarity'].includes(id)) {
        if (!Number.isFinite(event.value)) return null;
        return { [id]: Math.max(0, Math.min(100, event.value!)) / 100 };
    }
    if (id === 'sourceOrder') {
        const text = event.text ?? '';
        if (text.startsWith('toggle:')) {
            const providerId = text.slice('toggle:'.length).trim();
            if (!providerId) return null;
            const nextEnabled = settings.enabled[providerId] === false;
            return {
                enabled: { ...settings.enabled, [providerId]: nextEnabled },
                ...(!nextEnabled && settings.source === providerId ? { source: 'all' } : {}),
            };
        }
        if (text.startsWith('weight:')) {
            const rest = text.slice('weight:'.length);
            const sep = rest.lastIndexOf(':');
            if (sep <= 0) return null;
            const providerId = rest.slice(0, sep);
            const weight = Number(rest.slice(sep + 1));
            if (settings.enabled[providerId] === false) return null;
            if ([.5, 1, 2, 3].includes(weight)) {
                return { weights: { ...settings.weights, [providerId]: weight } };
            }
            return null;
        }
        try {
            const order: unknown = JSON.parse(text);
            if (!Array.isArray(order) || !order.length) return null;
            if (!order.every((item): item is string => typeof item === 'string' && item.length > 0)) return null;
            if (new Set(order).size !== order.length) return null;
            if (knownSourceIds && !order.every(item => knownSourceIds.includes(item))) return null;
            // Preserve any previously saved offline/unlisted IDs after the newly ordered visible IDs.
            const merged = [
                ...order,
                ...(settings.sourceOrder || []).filter(existing => !order.includes(existing)),
            ];
            return { sourceOrder: merged };
        } catch {
            return null;
        }
    }
    if (id.startsWith('source:')) {
        const source = id.slice(7);
        if (event.text === '1' || event.text === '0') {
            const nextEnabled = event.text === '1';
            return {
                enabled: { ...settings.enabled, [source]: nextEnabled },
                ...(!nextEnabled && settings.source === source ? { source: 'all' } : {}),
            };
        }
        if (event.text?.startsWith('weight:') && settings.enabled[source] !== false) {
            const weight = Number(event.text.slice(7));
            if ([.5, 1, 2, 3].includes(weight)) return { weights: { ...settings.weights, [source]: weight } };
        }
    }
    if (id === 'modules') {
        if (event.text?.startsWith('toggle:')) {
            const module = event.text.slice(7) as DiscoveryModule;
            if (discoveryModules.includes(module)) {
                return {
                    hidden: settings.hidden.includes(module)
                        ? settings.hidden.filter(m => m !== module)
                        : [...settings.hidden, module],
                };
            }
        } else {
            try {
                const order: unknown = JSON.parse(event.text ?? '');
                if (
                    Array.isArray(order)
                    && order.length === discoveryModules.length
                    && new Set(order).size === order.length
                    && order.every(m => discoveryModules.includes(m))
                ) {
                    return { modules: order };
                }
            } catch { /* Ignore incomplete or stale bridge packets. */ }
        }
    }
    return null;
}

export const resetDiscoverySourceOrder = (): Partial<DiscoverySettings> => ({ sourceOrder: [] });
export const resetDiscoveryLayout = (): Partial<DiscoverySettings> => ({ modules: [...discoveryModules], hidden: [] });
export const resetDiscoveryParameters = (): Partial<DiscoverySettings> => ({
    exploration: defaultDiscoverySettings.exploration,
    crossArtist: defaultDiscoverySettings.crossArtist,
    familiarity: defaultDiscoverySettings.familiarity,
    weights: {},
});
