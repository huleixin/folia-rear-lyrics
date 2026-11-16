import { defineCommand } from '../commandFactories';
import { isAndroidNativeRuntime } from '../../../utils/platform';
import type { CommandPaletteCommand } from '../types';
import { useMobileLibraryStore } from '../../../stores/useMobileLibraryStore';
import { useHomeSourceStore } from '../../../stores/useHomeSourceStore';
import { requestDiscoverySettingsPanel } from '../../../services/discovery/settingsPanel';

// The native recommendation settings panel owns the controls. This entry takes the listener
// to the recommendation page, where the same settings action is available.
export const discoveryCommands: CommandPaletteCommand[] = [
    defineCommand({
        id: 'discovery-settings', group: 'settings', title: '推荐设置 / Recommendation settings',
        description: '调整推荐来源权重、探索程度、模块与本地偏好',
        keywords: ['recommendation', 'radar', 'roaming', '推荐', '雷达', '漫游', '偏好'],
        isAvailable: isAndroidNativeRuntime,
        execute: () => {
            useHomeSourceStore.getState().setSource('online');
            useMobileLibraryStore.getState().setPage('home');
            return requestDiscoverySettingsPanel();
        },
    }),
];
