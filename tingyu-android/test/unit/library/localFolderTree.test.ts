import { describe, expect, it } from 'vitest';
import { buildMusicFolders, folderAt, songsInFolder } from '../../../src/library/core/model/localFolderTree';
import type { LocalSong } from '../../../src/types';

// test/unit/library/localFolderTree.test.ts
describe('physical music folders', () => {
    const songs = [{id:'a',folderName:'external_primary/Music/Album'}, {id:'b',folderName:'sdcard/Music/Album'}, {id:'c',folderName:'external_primary/Music'}, {id:'d'}] as LocalSong[];
    it('keeps equal folder names on different volumes distinct', () => {
        const tree = buildMusicFolders(songs);
        expect(folderAt(tree,'external_primary/Music/Album').songs[0].id).toBe('a');
        expect(folderAt(tree,'sdcard/Music/Album').songs[0].id).toBe('b');
        expect(tree.count).toBe(4);
    });
    it('includes descendant tracks once and preserves direct tracks', () => {
        const tree = buildMusicFolders(songs);
        expect(songsInFolder(folderAt(tree,'external_primary')).map(s=>s.id).sort()).toEqual(['a','c']);
        expect(folderAt(tree,'未分类').songs[0].id).toBe('d');
    });
    it('returns root when a folder disappeared and normalizes Windows paths', () => {
        const tree = buildMusicFolders([{id:'x',folderName:'D:\\Music\\Album'}] as LocalSong[]);
        expect(folderAt(tree,'D:/Music/Album').songs[0].id).toBe('x');
        expect(folderAt(tree,'missing')).toBe(tree);
    });
});
