import type { LocalSong } from '../../../types';

// src/library/core/model/localFolderTree.ts
export interface MusicFolder { path: string; name: string; children: Map<string, MusicFolder>; songs: LocalSong[]; count: number }
export function buildMusicFolders(songs: LocalSong[]): MusicFolder {
    const root: MusicFolder = { path: '', name: '', children: new Map(), songs: [], count: 0 };
    for (const song of songs) {
        const parts = (song.folderName || '未分类').replace(/\\/g, '/').split('/').filter(Boolean);
        let node = root;
        node.count++;
        for (const name of parts) {
            let child = node.children.get(name);
            if (!child) {
                child = { name, path: [node.path, name].filter(Boolean).join('/'), children: new Map(), songs: [], count: 0 };
                node.children.set(name, child);
            }
            node = child; node.count++;
        }
        node.songs.push(song);
    }
    return root;
}
export function folderAt(root: MusicFolder, path: string): MusicFolder {
    let node = root;
    for (const part of path.split('/').filter(Boolean)) {
        const child = node.children.get(part);
        if (!child) return root;
        node = child;
    }
    return node;
}
export function songsInFolder(folder: MusicFolder): LocalSong[] {
    return [...folder.songs, ...Array.from(folder.children.values()).flatMap(songsInFolder)];
}
