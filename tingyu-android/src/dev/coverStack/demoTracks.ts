// src/dev/coverStack/demoTracks.ts
// Demo 用的曲目表。字段形状刻意与 SongResult 对齐（sourceRef 可直接被 getPlaybackSongKey 解析），
// 接入正式播放器时把 DEMO_TRACKS 换成真实队列即可，堆叠层不需要改。

export interface DemoTrack {
    id: string;
    name: string;
    artists: { id: string; name: string }[];
    album: { id: string; name: string; coverUrl?: string };
    durationMs: number;
    sourceRef: { kind: 'online'; providerId: 'demo'; mediaId: string };
}

// 封面写死成完整路径（不用拼接），这样打包单文件 Demo 时可以被直接内联成 data URI
const COVER = {
    tide: '/dev/assets/cover-stack/tide.svg',
    midnightRadio: '/dev/assets/cover-stack/midnight-radio.svg',
    mountainMist: '/dev/assets/cover-stack/mountain-mist.svg',
    neonAfterimage: '/dev/assets/cover-stack/neon-afterimage.svg',
    paperSea: '/dev/assets/cover-stack/paper-sea.svg',
    echoRoom: '/dev/assets/cover-stack/echo-room.svg',
};

const demo = (id: string, name: string, artist: string, album: string, coverUrl: string | null, durationMs: number): DemoTrack => ({
    id,
    name,
    artists: [{ id: `${id}-artist`, name: artist }],
    album: { id: `${id}-album`, name: album, ...(coverUrl ? { coverUrl } : {}) },
    durationMs,
    sourceRef: { kind: 'online', providerId: 'demo', mediaId: id },
});

export const DEMO_TRACKS: DemoTrack[] = [
    demo('d1', '潮汐线', '南屿', '潮汐线', COVER.tide, 231000),
    demo('d2', '午夜电台', '林澈', '午夜电台', COVER.midnightRadio, 254000),
    demo('d3', '山雾', '远山乐队', '山雾', COVER.mountainMist, 268000),
    demo('d4', '霓虹残像', '夜航星', '霓虹残像', COVER.neonAfterimage, 205000),
    demo('d5', '纸上的海', '洛安', '纸上的海', COVER.paperSea, 289000),
    demo('d6', '回声房间', '空岛', '回声房间', COVER.echoRoom, 243000),
    // 封面缺失的样本：验证降级路径（占位封面 + 仍然可以切歌）
    demo('d7', '未命名录音', '本地文件', '未知专辑', null, 187000),
];

export const trackCoverUrl = (track: DemoTrack | null): string | null => track?.album.coverUrl ?? null;

export const trackArtistLabel = (track: DemoTrack | null): string => (
    track ? track.artists.map(artist => artist.name).filter(Boolean).join(' / ') : ''
);

export const formatDuration = (ms: number): string => {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
