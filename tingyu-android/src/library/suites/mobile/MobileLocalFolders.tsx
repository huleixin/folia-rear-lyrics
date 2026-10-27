import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Folder, ListMusic } from 'lucide-react';
import type { LocalSong, LocalLibraryGroup } from '../../../types';
import { buildMusicFolders, folderAt, songsInFolder } from '../../core/model/localFolderTree';
import MobileDirectory from './MobileDirectory';
import { hasBlockingWindow } from '../../../utils/keyboardTargets';

// src/library/suites/mobile/MobileLocalFolders.tsx
export default function MobileLocalFolders({ songs, onOpen, isInteractive }: { songs: LocalSong[]; isInteractive: boolean; onOpen: (group: LocalLibraryGroup) => void }) {
    const root = useMemo(() => buildMusicFolders(songs), [songs]);
    const [path, setPath] = useState('');
    const folder = useMemo(() => folderAt(root, path), [root, path]);
    const children = useMemo(() => Array.from(folder.children.values()), [folder]);
    const parent = () => setPath(folder.path.split('/').slice(0, -1).join('/'));
    useEffect(() => {
        const back = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || !isInteractive || !folder.path || hasBlockingWindow()) return;
            event.preventDefault(); event.stopImmediatePropagation(); parent();
        };
        window.addEventListener('keydown', back, true);
        return () => window.removeEventListener('keydown', back, true);
    }, [folder.path, isInteractive]);
    const openSongs = () => onOpen({ id: `folder:${folder.path}`, name: folder.name || '全部本地音乐', type: 'folder', songs: songsInFolder(folder) });
    return <>
        <div className="ml-folder-path">
            <button className="ml-icon" aria-label="上级文件夹" disabled={!folder.path} onClick={parent}><ArrowLeft size={20}/></button>
            <span title={folder.path}><Folder size={17}/>{folder.path || '文件夹'}</span>
            <button className="ml-text-button" disabled={!folder.count} onClick={openSongs}><ListMusic size={18}/>查看全部 {folder.count}</button>
        </div>
        {folder.songs.length > 0 && <button className="ml-text-button" onClick={() => onOpen({ id: `folder-direct:${folder.path}`, type: 'folder', name: folder.name || '未分类', songs: folder.songs })}>当前文件夹的歌曲 · {folder.songs.length}</button>}
        <MobileDirectory fillBehindFooter alwaysShowFilter enableSort restoreKey={`local-folders:${folder.path}`}
            emptyMessage={folder.count ? '点击上方查看歌曲' : '扫描或导入音乐后，按原始文件夹显示'}
            cards={children.map(child => ({ id: child.path, name: child.name, trackCount: child.count, description: child.path }))}
            onOpen={card => setPath(String(card.id))}/>
    </>;
}
