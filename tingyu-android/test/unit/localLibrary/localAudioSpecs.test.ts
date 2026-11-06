import { describe, expect, it } from 'vitest';
import { deriveLocalAudioSpecs } from '../../../src/services/playbackAdapters';
import type { LocalSong } from '../../../src/types';

// test/unit/localLibrary/localAudioSpecs.test.ts
// 阶段五：本地歌曲音质标注推导。规则保守——无损容器标 lossless；
// 有损容器只有估算码率 ≥256kbps 才标 high；算不出就不标（无数据档位不显示）。

const song = (mimeType: string, fileSize: number, duration: number): LocalSong => ({
    id: 's1',
    fileName: 'a',
    filePath: 'Music/a',
    duration,
    fileSize,
    mimeType,
    addedAt: 1,
    title: 'a',
    titleOrigin: 'import',
    importedMetadata: { title: 'a', titleSource: 'filename', artistNames: ['x'], albumName: 'y' },
    hasManualLyricSelection: false,
    noAutoMatch: false,
});

describe('deriveLocalAudioSpecs', () => {
    it('无损容器（flac/wav）标 lossless，与码率无关', () => {
        expect(deriveLocalAudioSpecs(song('audio/flac', 40_000_000, 200_000))).toEqual(['lossless']);
        expect(deriveLocalAudioSpecs(song('audio/x-wav', 40_000_000, 200_000))).toEqual(['lossless']);
    });

    it('高码率有损（≥256kbps）标 high', () => {
        // 320kbps × 200s ≈ 8MB
        expect(deriveLocalAudioSpecs(song('audio/mpeg', 8_000_000, 200_000))).toEqual(['high']);
        // AAC 同理
        expect(deriveLocalAudioSpecs(song('audio/mp4a-latm', 8_000_000, 200_000))).toEqual(['high']);
    });

    it('低码率有损不标任何档位（不编造）', () => {
        // 128kbps × 200s ≈ 3.2MB
        expect(deriveLocalAudioSpecs(song('audio/mpeg', 3_200_000, 200_000))).toBeUndefined();
    });

    it('时长或大小缺失时不标（边界不猜）', () => {
        expect(deriveLocalAudioSpecs(song('audio/mpeg', 8_000_000, 0))).toBeUndefined();
        expect(deriveLocalAudioSpecs(song('audio/flac', 0, 0))).toEqual(['lossless']);
    });
});
