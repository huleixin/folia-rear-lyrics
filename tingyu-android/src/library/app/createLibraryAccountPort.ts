import type { RefObject } from 'react';
import type { LyricData } from '../../types';
import type { OnlineProviderId } from '../../types/onlineMusic';
import type { LibraryProviderSwitchCleanupPort } from '../core/contracts/account';
import { useSearchNavigationStore } from '../../stores/useSearchNavigationStore';
import { useCollectionNavigationStore } from '../../stores/useCollectionNavigationStore';

// src/library/app/createLibraryAccountPort.ts
// 在线账户 controller 的切换清理端口（照 createLibraryHomePort 的做法）：用户确认切换平台后、controller 写新的
// 当前平台之前，只清理浏览运行态。播放队列按 provider + mediaId 标识，独立于浏览平台，支持混播。

/** 保留调用方接口兼容；浏览平台切换不再读取或重置这些播放器句柄。 */
export type LibraryAccountSwitchHost = {
    audioRef: RefObject<HTMLAudioElement | null>;
    automixRef: RefObject<{ abortTransition: () => void } | null>;
    /** App 的歌词写入（带过滤设置的那一个；清空时只传 null）。 */
    setLyrics: (lyrics: LyricData | null) => void;
};

export const createLibraryAccountSwitchCleanupPort = (
    _getHost: () => LibraryAccountSwitchHost,
): LibraryProviderSwitchCleanupPort => ({
    resetForProviderSwitch: (nextProviderId: OnlineProviderId) => {
        // Keep audio, lyrics, FM and provider-scoped caches alive while browsing another catalog.
        useSearchNavigationStore.getState().resetRuntime(nextProviderId);
        useCollectionNavigationStore.getState().clear();
    },
});
