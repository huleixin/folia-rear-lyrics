import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNativeSettingsDocument } from '../../../hooks/useNativeSettingsDocument';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';
import { useDiscoverySettingsStore } from '../../../stores/useDiscoverySettingsStore';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { discoverySources } from '../../../services/discovery/service';
import { clearDiscoveryPreferences } from '../../../services/discovery/preferences';
import { omni } from '../../../services/onlineMusic/omni';
import { runTopModalBack } from '../../../services/modalBackStack';
import { handleSettingsPaneBack } from './settingsSplitNavigation';
import OperationPanel from '../../shared/OperationPanel';
import {
    discoverySettingsModel,
    discoverySettingsPatch,
    resetDiscoveryLayout,
    resetDiscoveryParameters,
    resetDiscoverySourceOrder,
} from './discoverySettingsModel';

// src/components/modal/settings/DiscoverySettingsPage.tsx
export default function DiscoverySettingsPage({ onClose }: { onClose: () => void }) {
    useTranslation(); // Refresh presentation labels after a language change.
    const root = useRef<HTMLDivElement>(null), settings = useDiscoverySettingsStore();
    const accounts = useOnlineProviderAccountStore(s => s.accounts);
    useSyncExternalStore(omni.subscribeProviders, omni.getProviderRegistryVersion);
    const fromIndex = useSettingsModalStore(s => s.settingsModalState.returnToIndex);
    const [confirm, setConfirm] = useState<string | null>(null);
    const back = () => handleSettingsPaneBack(fromIndex, onClose);
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !event.defaultPrevented) {
                if (runTopModalBack()) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    return;
                }
                event.preventDefault();
                event.stopImmediatePropagation();
                back();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [fromIndex, onClose]);

    const currentSources = [
        ...discoverySources().map(s => ({
            ...s,
            loggedIn: Boolean(accounts[s.providerId]?.user),
        })),
        {
            providerId: 'local',
            displayName: '本地音乐',
            statusText: '本机曲库',
        },
    ];
    const knownSourceIds = currentSources.map(s => s.providerId);

    useNativeSettingsDocument(
        root,
        true,
        'discovery',
        '推荐设置',
        discoverySettingsModel(settings, currentSources),
        (id, event) => {
            if (['clear', 'resetLayout', 'resetParameters', 'resetSourceOrder'].includes(id)) {
                setConfirm(id);
                return;
            }
            if (id === 'openAccounts') {
                useSettingsModalStore.getState().pushSettingsSubview('accounts');
                return;
            }
            if (id === 'manageSources') {
                useSettingsModalStore.getState().pushSettingsSubview('integration');
                return;
            }
            const patch = discoverySettingsPatch(settings, id, event, knownSourceIds);
            if (patch) settings.patch(patch);
        },
        back,
    );

    const message = confirm === 'clear'
        ? '仅清空推荐偏好，不删除收藏、歌单、播放历史或本地音乐。'
        : confirm === 'resetLayout'
            ? '恢复模块默认顺序并显示所有模块？'
            : confirm === 'resetSourceOrder'
                ? '仅恢复推荐来源的默认排列顺序，保留当前开关、推荐权重与账号状态？'
                : '恢复探索、跨歌手、熟悉音乐及来源权重的默认值？';

    return createPortal(
        <div
            ref={root}
            className="fixed inset-0"
            style={{ zIndex: 136 }}
            data-folia-settings-overlay="true"
            data-folia-keyboard-window="true"
            data-settings-layout="column"
        >
            <OperationPanel
                id="discovery-settings-confirm"
                panel={confirm ? {
                    title: '确认操作',
                    kind: 'dialog',
                    blocks: [{ id: 'confirm', kind: 'confirm', message, confirmLabel: '确认', cancelLabel: '取消' }],
                } : null}
                onClose={() => setConfirm(null)}
                onAction={id => {
                    if (id === 'confirm') {
                        if (confirm === 'clear') clearDiscoveryPreferences();
                        else if (confirm === 'resetLayout') settings.patch(resetDiscoveryLayout());
                        else if (confirm === 'resetSourceOrder') settings.patch(resetDiscoverySourceOrder());
                        else settings.patch(resetDiscoveryParameters());
                    }
                    setConfirm(null);
                }}
            />
        </div>,
        document.body,
    );
}
