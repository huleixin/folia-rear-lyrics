import React, { useState } from 'react';
import OperationPanel from '../OperationPanel';
import { defaultDiscoverySettings, discoveryModules, useDiscoverySettingsStore, type DiscoveryModule } from '../../../../../stores/useDiscoverySettingsStore';
import { clearDiscoveryPreferences } from '../../../../../services/discovery/preferences';
import { discoverySources } from '../../../../../services/discovery/service';
import type { NativePanelBlock } from '../../../../../types/nativePanels';

export const moduleNames: Record<DiscoveryModule, string> = { roam: '听屿漫游', shortcuts: '快捷入口', radars: '你的专属雷达', songs: '猜你想听', collections: '为你精选歌单', recent: '最近播放', playlists: '我的歌单' };
export default function DiscoverySettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
    const settings = useDiscoverySettingsStore();
    const [confirm, setConfirm] = useState(false);
    const blocks: NativePanelBlock[] = [
        { kind: 'toggle', id: 'record', label: '个性化记录', hint: '仅保存在本机；关闭后不再记录新的偏好', value: settings.record },
        { kind: 'toggle', id: 'local', label: '综合推荐包含本地音乐', value: settings.includeLocal },
        ...(['exploration','crossArtist','familiarity'] as const).map((id,index): NativePanelBlock => ({ kind: 'select', id, label: ['音乐探索程度','跨歌手探索','熟悉音乐比例'][index], value: String(settings[id]),
            options: [0,.2,.3,.5,.8,1].map(value => ({ value: String(value), label: Math.round(value*100) + '%' })) })),
        ...discoverySources().flatMap(source => [
            { kind: 'toggle' as const, id: 'source:' + source.providerId, label: source.displayName, value: settings.enabled[source.providerId] !== false },
            { kind: 'select' as const, id: 'weight:' + source.providerId, label: source.shortName + '推荐权重', value: String(settings.weights[source.providerId] ?? 1), options: [.5,1,2,3].map(value => ({ value: String(value), label: value + '×' })) },
        ]),
        ...settings.modules.flatMap(module => [
            { kind: 'toggle' as const, id: 'module:' + module, label: moduleNames[module], value: !settings.hidden.includes(module) },
            { kind: 'actions' as const, id: 'order:' + module, items: [{ id: 'up:' + module, label: moduleNames[module] + '上移', disabled: settings.modules[0] === module }] },
        ]),
        { kind: 'actions', id: 'data', items: [{ id: 'layout', label: '恢复默认布局' }, { id: 'reset', label: '恢复推荐参数' }, { id: 'clear', label: '清空推荐偏好', tone: 'danger' }] },
        ...(confirm ? [{ kind: 'confirm' as const, id: 'confirm-clear', message: '仅清空推荐偏好，不删除收藏、歌单、历史或本地音乐。', confirmLabel: '清空', cancelLabel: '取消' }] : []),
    ];
    return <OperationPanel id="discovery-settings" panel={open ? { title: '推荐设置', blocks, heightFraction: .9 } : null} onClose={onClose} onAction={(id,payload) => {
        const [action, value] = id.split(':');
        if (id === 'record') settings.patch({ record: !settings.record });
        else if (id === 'local') settings.patch({ includeLocal: !settings.includeLocal });
        else if (id === 'clear') setConfirm(true);
        else if (id === 'confirm-clear') { clearDiscoveryPreferences(); setConfirm(false); }
        else if (id === 'layout') settings.patch({ modules: [...discoveryModules], hidden: [] });
        else if (id === 'reset') settings.patch({ exploration: defaultDiscoverySettings.exploration, crossArtist: defaultDiscoverySettings.crossArtist, familiarity: defaultDiscoverySettings.familiarity, weights: {} });
        else if (action === 'source') settings.patch({ enabled: { ...settings.enabled, [value]: settings.enabled[value] === false } });
        else if (action === 'weight') settings.patch({ weights: { ...settings.weights, [value]: Number(payload?.text) || 1 } });
        else if (action === 'module') settings.patch({ hidden: settings.hidden.includes(value as DiscoveryModule) ? settings.hidden.filter(item => item !== value) : [...settings.hidden, value as DiscoveryModule] });
        else if (action === 'up') { const modules = [...settings.modules], index = modules.indexOf(value as DiscoveryModule); if (index > 0) { [modules[index-1], modules[index]] = [modules[index], modules[index-1]]; settings.patch({ modules }); } }
        else if (['exploration','crossArtist','familiarity'].includes(id)) settings.patch({ [id]: Math.max(0,Math.min(1,Number(payload?.text) || 0)) });
    }}/>;
}
