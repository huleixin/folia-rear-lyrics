import { Download } from 'lucide-react';
import { isCapacitorAndroid } from '../../../platform/runtime';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';
import { defineCommand } from '../commandFactories';

// Cache actions open the native storage controls so consent and deletion confirmation remain visible.
const storage = () => { useSettingsModalStore.getState().openSettings('options', 'storage'); return true; };
export const audioCacheCommands = [
    ...[
        ['audio-cache', 'Save while listening', 'Enable persistent caching in storage settings', ['边听边存', '离线缓存']],
        ['audio-cache-wifi', 'Cache on Wi-Fi', 'Choose whether caching can use mobile data', ['Wi-Fi缓存', '自动缓存']],
        ['audio-cache-playlist', 'Automatic playlist caching', 'Configure whole-playlist caching', ['缓存歌单', '整单缓存']],
        ['audio-cache-tasks', 'Cache tasks', 'View progress, retry or stop cache tasks', ['缓存进度', '重试缓存', '停止缓存']],
        ['audio-cache-clear', 'Clear audio cache', 'Review and confirm deleting cached audio', ['清空音频缓存']],
    ].map(([id, title, description, keywords]) => defineCommand({
        id: id as string, title: title as string, description: description as string, keywords: keywords as string[],
        group: 'settings', icon: Download, isAvailable: isCapacitorAndroid, execute: storage,
    })),
];
