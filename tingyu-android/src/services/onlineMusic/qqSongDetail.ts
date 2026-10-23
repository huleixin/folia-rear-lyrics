import type { UnifiedSong } from '../../types';
import type { MediaId } from '../../types/onlineMusic';
import { normalizeQqSong } from './qqNormalize';
import { requestQq } from './qqTransport';

// src/services/onlineMusic/qqSongDetail.ts
// `/getSongInfo` 单曲详情：播放侧的 getSongDetail、搜索结果补 mid、歌单写入补数字 id 都用它。

export const getQqSongDetail = async (id: MediaId): Promise<UnifiedSong | null> => {
    const response = await requestQq<any>('song_info', { songmid: String(id) });
    const track = response?.response?.songinfo?.data?.track_info;
    if (!track || typeof track !== 'object') return null;
    const song = normalizeQqSong(track);
    return song.qqMid ? song : null;
};

const qqSongDetailRequests = new Map<string, Promise<UnifiedSong | null>>();

// 同一首歌的专辑与歌手会各触发一次解析，两次落到同一个 songmid 上，去重掉重复请求。
export const requestQqSongDetail = (songmid: string): Promise<UnifiedSong | null> => {
    const cached = qqSongDetailRequests.get(songmid);
    if (cached) return cached;

    const request = getQqSongDetail(songmid).finally(() => {
        if (qqSongDetailRequests.get(songmid) === request) qqSongDetailRequests.delete(songmid);
    });
    qqSongDetailRequests.set(songmid, request);
    return request;
};
