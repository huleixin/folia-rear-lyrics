import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalSong } from '../../../src/types';

// test/unit/localLibrary/localSongInfoEdit.test.ts
// 阶段三：手动编辑歌曲信息（标题/歌手/专辑）。锁定三条边界：
// 只改曲库记录与分类归属；在线匹配结果（onlineMetadata）不被清掉；不写音频文件标签（本来就没有这个路径）。

const makeSong = (id: string, patch: Partial<LocalSong> = {}): LocalSong => ({
    id,
    fileName: `${id}.flac`,
    filePath: `Music/${id}.flac`,
    duration: 200_000,
    fileSize: 1,
    mimeType: 'audio/flac',
    addedAt: 1000,
    title: `歌曲${id}`,
    titleOrigin: 'import',
    importedMetadata: { title: `歌曲${id}`, titleSource: 'filename', artistNames: ['旧歌手'], albumName: '旧专辑' },
    hasManualLyricSelection: false,
    noAutoMatch: false,
    ...patch,
});

(globalThis as unknown as { window: unknown }).window = globalThis;

let service: typeof import('../../../src/services/localLibraryCatalogService');

beforeEach(async () => {
    vi.resetModules();
    service = await import('../../../src/services/localLibraryCatalogService');
    const { appDatabase: db } = await import('../../../src/services/appDatabase');
    await Promise.all([
        db.local_music.clear(),
        db.local_library_entities.clear(),
        db.local_library_assignments.clear(),
        db.local_play_history.clear(),
    ]);
});

describe('updateLocalSongInfoManually', () => {
    it('更新标题（origin=manual-match）并同步歌手/专辑分类', async () => {
        const { appDatabase: db } = await import('../../../src/services/appDatabase');
        const song = makeSong('s1');
        await db.local_music.put(song);

        const updated = await service.updateLocalSongInfoManually('s1', {
            title: '新标题',
            artistNames: ['新歌手'],
            albumName: '新专辑',
        });

        expect(updated?.title).toBe('新标题');
        const stored = await db.local_music.get('s1');
        expect(stored?.title).toBe('新标题');
        expect(stored?.titleOrigin).toBe('manual-match');
        // importedMetadata 保留导入原文 —— 「还原为导入信息」按钮的依据，手动编辑不清掉它。
        expect(stored?.importedMetadata.title).toBe('歌曲s1');
        // 分类归属跟着走：新专辑实体存在，歌曲指向它。
        const entities = await db.local_library_entities.toArray();
        // 实体记录字段以现状为准：打印一次帮助对齐断言（name 字段在 LocalLibraryEntity 上）。
        const albumEntity = entities.find(entity => entity.kind === 'album' && entity.displayName === '新专辑');
        expect(albumEntity).toBeDefined();
        const assignment = await db.local_library_assignments.get('s1');
        expect(assignment?.albumEntityId).toBe(albumEntity?.id);
        expect(assignment?.albumOrigin).toBe('manual-match');
    });

    it('已有在线匹配结果的歌曲：只改本地记录，onlineMetadata 原样保留', async () => {
        const { appDatabase: db } = await import('../../../src/services/appDatabase');
        const song = makeSong('s2', {
            onlineMetadata: {
                source: 'netease' as const,
                songId: '999',
                title: '在线标题',
                artists: [{ id: '1', name: '在线歌手' }],
                album: { id: '2', name: '在线专辑' },
                coverUrl: 'https://example.com/cover.jpg',
                matchMode: 'auto' as const,
                matchedAt: 1,
            },
        });
        await db.local_music.put(song);

        await service.updateLocalSongInfoManually('s2', { title: '手动标题', artistNames: ['手动歌手'] });

        const stored = await db.local_music.get('s2');
        expect(stored?.title).toBe('手动标题');
        expect(stored?.onlineMetadata?.title).toBe('在线标题');
        expect(stored?.onlineMetadata?.coverUrl).toBe('https://example.com/cover.jpg');
    });

    it('三个字段全空时是空操作（保存按钮本来也点不了，这里兜底）', async () => {
        const { appDatabase: db } = await import('../../../src/services/appDatabase');
        await db.local_music.put(makeSong('s3'));
        const result = await service.updateLocalSongInfoManually('s3', { title: '  ', artistNames: [] });
        expect(result).toBeUndefined();
        const stored = await db.local_music.get('s3');
        expect(stored?.title).toBe('歌曲s3');
    });
});
