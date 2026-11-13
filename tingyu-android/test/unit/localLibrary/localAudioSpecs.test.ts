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


describe('local source format evidence', () => {
    const source = (patch: Partial<LocalSong>) => ({ ...song('audio/mp4', 0, 0), ...patch });
    it('requires both hi-res dimensions and lossless evidence', () => {
        expect(deriveLocalAudioSpecs(source({ codec: 'ALAC', sampleRate: 96000, bitDepth: 24 }))).toEqual(['hires']);
        for (const patch of [
            { sampleRate: 44100, bitDepth: 24 }, { sampleRate: 96000, bitDepth: 16 },
            { sampleRate: 96000 }, { bitDepth: 24 }, { sampleRate: Infinity, bitDepth: 24 },
            { sampleRate: 96000, bitDepth: NaN },
        ]) expect(deriveLocalAudioSpecs(source({ lossless: true, ...patch }))).toEqual(['lossless']);
        expect(deriveLocalAudioSpecs(source({ lossless: true, sampleRate: 48000, bitDepth: 24 }))).toEqual(['hires']);
        expect(deriveLocalAudioSpecs(source({ sampleRate: 96000, bitDepth: 24 }))).toBeUndefined();
    });
    it('does not mistake a lossy codec or a lookalike MIME for lossless', () => {
        expect(deriveLocalAudioSpecs(source({ mimeType: 'audio/wav', codec: 'ADPCM', sampleRate: 96000, bitDepth: 24 }))).toBeUndefined();
        expect(deriveLocalAudioSpecs(source({ mimeType: 'audio/flac', lossless: false }))).toBeUndefined();
        expect(deriveLocalAudioSpecs(source({ mimeType: 'audio/not-flac' }))).toBeUndefined();
        expect(deriveLocalAudioSpecs(source({ codec: 'AAC', sampleRate: 96000, bitDepth: 24 }))).toBeUndefined();
    });
    it('prefers measured source bitrate and does not round up the threshold', () => {
        expect(deriveLocalAudioSpecs(source({ bitrate: 320000 }))).toEqual(['high']);
        expect(deriveLocalAudioSpecs({ ...song('audio/mpeg', 8000000, 200000), bitrate: 128000 })).toBeUndefined();
        expect(deriveLocalAudioSpecs(song('audio/mpeg', 6399999, 200000))).toBeUndefined();
    });
});
