import type { SongResult } from '../../types';
import type { ProviderLyricsResult } from '../../types/onlineMusic';
import { lxHttp } from '../lxSource/http';
import { parseLyricsAsync } from '../../utils/lyrics/workerClient';

// src/services/onlineMusic/lxCatalogLyrics.ts
export async function getLxCatalogLyrics(platform:string,song:SongResult):Promise<ProviderLyricsResult> {
    const ref = song.sourceRef;
    if (ref?.kind !== 'online') return {lyrics:null,isPureMusic:false};
    try {
        let mainText = '';
        if (platform === 'kw') {
            const response = await lxHttp('https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId='+encodeURIComponent(ref.mediaId),{},new AbortController().signal);
            const body = response.body as {data?:{lrclist?:{time:string;lineLyric:string}[]}};
            mainText = (body?.data?.lrclist || []).map(line=>{const time=Number(line.time);if(!Number.isFinite(time))return '';return `[${String(Math.floor(time/60)).padStart(2,'0')}:${(time%60).toFixed(3).padStart(6,'0')}]${line.lineLyric}`;}).join('\n');
        } else if (platform === 'mg' && typeof ref.providerData?.lrcUrl === 'string' && ref.providerData.lrcUrl) {
            const response = await lxHttp(ref.providerData.lrcUrl,{},new AbortController().signal);
            if (typeof response.body === 'string') mainText = response.body;
        }
        return {lyrics:mainText ? await parseLyricsAsync('lrc',mainText) : null,mainText,isPureMusic:false};
    } catch { return {lyrics:null,isPureMusic:false}; }
}
