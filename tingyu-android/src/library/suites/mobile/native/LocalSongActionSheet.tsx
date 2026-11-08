import { useTranslation } from 'react-i18next';
import OperationPanel from './OperationPanel';
import type { NativePanelModel } from '../../../../types/nativePanels';
import type { SongResult } from '../../../../types';

// src/library/suites/mobile/native/LocalSongActionSheet.tsx
//
// 本地歌曲操作菜单：首页「最近播放」的 ⋮ 与资料库歌曲行的 ⋯ 共用同一套动作
// （播放 / 加入歌单 / 收藏切换 / 查看专辑）。
//
// 原生化专项（第 21 轮）：渲染统一交给 OperationPanel —— Android 用原生面板，
// 其它平台仍用同一份声明的 .ml-sheet。动作本身仍是调用方传进来的闭包，没有二次实现。
// liked=null 表示收藏态还没预读完成（开关暂时不出现），true/false 为当前状态。

export type LocalSongMenu = { song: SongResult; queue: SongResult[] };

export default function LocalSongActionSheet({ menu, liked, onClose, onPlay, onAddToPlaylist, onToggleLike, onViewAlbum }: {
    menu: LocalSongMenu;
    liked: boolean | null;
    onClose: () => void;
    onPlay: () => void;
    onAddToPlaylist: () => void;
    onToggleLike: () => void;
    onViewAlbum: () => void;
}) {
    const { t } = useTranslation();
    const handlers: Record<string, () => void> = {
        play: onPlay,
        addToPlaylist: onAddToPlaylist,
        toggleLike: onToggleLike,
        viewAlbum: onViewAlbum,
    };
    const items = [
        { id: 'play', label: t('mobileLibrary.play'), icon: 'play-circle' },
        { id: 'addToPlaylist', label: t('localMusic.addToPlaylist'), icon: 'music2' },
        ...(liked !== null
            ? [{
                id: 'toggleLike',
                label: t(liked ? 'mobileLibrary.unlikeSong' : 'mobileLibrary.likeSong'),
                icon: 'heart',
                selected: liked,
            }]
            : []),
        { id: 'viewAlbum', label: t('localHome.viewAlbum'), icon: 'disc-2' },
    ];
    const panel: NativePanelModel = {
        title: menu.song.name,
        blocks: [{ kind: 'actions', id: 'local-track', items }],
    };
    return (
        <OperationPanel
            panel={panel}
            onAction={(id: string) => {
                const handler = handlers[id];
                if (!handler) return;
                // 动作先关面板再执行：与旧实现的点击即关闭同一顺序，避免面板挂在已失效的对象上。
                onClose();
                handler();
            }}
            onClose={onClose}
            id="local-track-menu"
        />
    );
}
