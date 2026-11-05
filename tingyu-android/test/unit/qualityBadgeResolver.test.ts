import { describe, expect, it } from 'vitest';
import { resolveCatalogQualityLevel, resolvePlayingQualityLevel } from '../../src/components/app/overlays/minimal-stage/qualityBadgeSpecs';
import type { NativeAudioSpec } from '../../src/types/nativeAudio';

// test/unit/qualityBadgeResolver.test.ts
// 六类真实样本的判定依据（任务书第 5 节）：
//   · 平台目录声明 ≠ 实际播放规格，两者分别走 resolveCatalogQualityLevel / resolvePlayingQualityLevel；
//   · Hi-Res 必须有 Media3 规格证据（位深 >16 或采样率 >48kHz）；
//   · 臻品母带没有平台数据入口就永不显示；空间音频必须有 Dolby 系编解码证据。

const spec = (over: Partial<NativeAudioSpec>): NativeAudioSpec => ({
    songKey: 'online:qq:00test', sourceId: 's1', mime: '', codecs: '',
    sampleRate: 44100, channels: 2, capturedAtMs: 0, confirmed: true, ...over,
});

describe('resolvePlayingQualityLevel（播放页：只认真实音源）', () => {
    it('样本2：16bit/44.1kHz FLAC → 黑金 FLAC · 无损（不升 Hi-Res）', () => {
        const result = resolvePlayingQualityLevel(['hires'], 'https://x/song.flac', spec({
            mime: 'audio/flac', sampleRate: 44100, bitrate: 900000,
        }));
        expect(result).toEqual({ level: 'flac', labelOverride: 'FLAC · 无损' });
    });

    it('样本3：96kHz FLAC → Hi-Res（规格证据：采样率>48kHz；位深 Media3 不暴露）', () => {
        const result = resolvePlayingQualityLevel(['lossless'], 'https://x/song.flac', spec({
            mime: 'audio/flac', sampleRate: 96000,
        }));
        expect(result).toEqual({ level: 'hires' });
    });

    it('样本3b：仅目录声明 hires、实际是普通 FLAC → 不升 Hi-Res（邓紫棋《唯一》案例的判定规则）', () => {
        const result = resolvePlayingQualityLevel(['hires', 'lossless'], 'https://x/song.flac', spec({
            mime: 'audio/flac', sampleRate: 44100,
        }));
        expect(result?.level).toBe('flac');
        expect(result?.level).not.toBe('hires');
    });

    it('样本1：320kbps AAC（M4A 容器）→ HQ', () => {
        const result = resolvePlayingQualityLevel(['high'], 'https://x/song.m4a', spec({
            mime: 'audio/mp4', codecs: 'mp4a.40.2', bitrate: 320000,
        }));
        expect(result).toEqual({ level: 'hq' });
    });

    it('样本1b：128kbps MP3 → 标准音质（目录说什么都不升级）', () => {
        const result = resolvePlayingQualityLevel(['hires', 'lossless'], 'https://x/song.mp3', spec({
            mime: 'audio/mpeg', bitrate: 128000,
        }));
        expect(result).toEqual({ level: 'standard' });
    });

    it('样本4：无法识别格式的 URL 且无 Media3 规格 → 隐藏（不推测）', () => {
        const result = resolvePlayingQualityLevel(['hires'], 'https://x/stream?key=abc', null);
        expect(result).toBeNull();
    });

    it('样本4b：URL 无扩展名但目录有 high → 标准（最低限度信息）', () => {
        const result = resolvePlayingQualityLevel(['high'], 'https://x/stream?key=abc', null);
        expect(result).toEqual({ level: 'standard' });
    });

    it('样本5：目录提供 Hi-Res、实际播放普通无损版本 → 播放页显示 FLAC 而非 Hi-Res', () => {
        const result = resolvePlayingQualityLevel(['hires'], 'https://x/song.flac', spec({
            mime: 'audio/flac', sampleRate: 44100,
        }));
        expect(result).toEqual({ level: 'flac', labelOverride: 'FLAC · 无损' });
    });

    it('样本6：切歌后规格随帧更新——同一解析器对新规格给出新标签', () => {
        const first = resolvePlayingQualityLevel([], 'https://x/a.flac', spec({
            songKey: 'a', mime: 'audio/flac', sampleRate: 44100,
        }));
        const second = resolvePlayingQualityLevel([], 'https://x/b.m4a', spec({
            songKey: 'b', mime: 'audio/mp4', codecs: 'mp4a.40.2', bitrate: 320000,
        }));
        expect(first?.level).toBe('flac');
        expect(second?.level).toBe('hq');
    });

    it('APE/WAV/DSD 显示真实格式文案，不冒充 FLAC', () => {
        expect(resolvePlayingQualityLevel([], 'https://x/a.ape', spec({ mime: 'audio/ape' }))?.labelOverride).toBe('APE · 无损');
        expect(resolvePlayingQualityLevel([], 'https://x/a.wav', spec({ mime: 'audio/wav' }))?.labelOverride).toBe('WAV · 无损');
        expect(resolvePlayingQualityLevel([], 'https://x/a.dsf', spec({ mime: 'audio/dsf', sampleRate: 2822400 }))?.labelOverride).toBe('DSD · 无损');
    });

    it('E-AC-3 (Dolby) 编解码 → 空间音频（有真实音轨证据）', () => {
        const result = resolvePlayingQualityLevel(['dolby'], 'https://x/song', spec({
            mime: 'audio/eac3', codecs: 'ec-3', sampleRate: 48000, bitrate: 768000,
        }));
        expect(result).toEqual({ level: 'spatial' });
    });

    it('普通音频 + 手机支持杜比 → 绝不显示空间音频（无音轨证据）', () => {
        const result = resolvePlayingQualityLevel(['dolby'], 'https://x/song.mp3', spec({
            mime: 'audio/mpeg', bitrate: 128000,
        }));
        expect(result).toEqual({ level: 'standard' });
    });

    it('臻品母带：无平台版本标识 → 播放页永不显示（母带没有任何旁路）', () => {
        // 即使目录声称 master、规格 24bit/96k，播放页也只有 Hi-Res 证据链可走：
        // master 需要"正在播放的平台对应版本"的明确标识，当前没有任何通道提供。
        const result = resolvePlayingQualityLevel(['master'], 'https://x/song.flac', spec({
            mime: 'audio/flac', sampleRate: 96000,
        }));
        expect(result?.level).toBe('hires'); // 规格证据只能支撑到 Hi-Res
    });

    it('兼容通道：URL 扩展名是唯一真实信息（MP3 → 标准，不套用 Media3 数据）', () => {
        expect(resolvePlayingQualityLevel(['hires', 'lossless'], 'https://x/song.mp3', null))
            .toEqual({ level: 'standard' });
        expect(resolvePlayingQualityLevel(['hires', 'lossless'], 'https://x/song.flac', null))
            .toEqual({ level: 'flac' });
    });
});

describe('resolveCatalogQualityLevel（列表：目录已确认提供的版本）', () => {
    it('high 映射 HQ，而不是标准音质', () => {
        expect(resolveCatalogQualityLevel(['high'])).toBe('hq');
    });

    it('hires 映射 Hi-Res，lossless 映射无损类', () => {
        expect(resolveCatalogQualityLevel(['hires'])).toBe('hires');
        expect(resolveCatalogQualityLevel(['lossless'])).toBe('flac');
    });

    it('dolby 映射空间音频；dts 不属于六枚中的任何一枚', () => {
        expect(resolveCatalogQualityLevel(['dolby'])).toBe('spatial');
        expect(resolveCatalogQualityLevel(['dts'])).toBeNull();
    });

    it('master 只有目录真的提供时才显示（数据类型已有入口，解析器无字段则永不触发）', () => {
        expect(resolveCatalogQualityLevel(['master' as never])).toBe('master');
        // 现有平台解析器（qq/netease/kugou）都不产出 master，所以运行时自然不显示。
    });
});
