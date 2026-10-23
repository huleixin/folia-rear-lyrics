import type { SearchAlbumHit, SearchArtistHit, SearchPlaylistHit, SearchSuggestions } from '../../types/search';
import { isFoliaExtensionBridgeAvailable, isFoliaExtensionBridgeConfigured, requestFoliaExtension } from '../foliaExtensionBridge';

// src/services/onlineMusic/qqSearchTransport.ts
// 听屿的 QQ 分类搜索与联想只走「现有而且真机验证可用」的两条通道：
//   - 分类搜索：musicu `DoSearchForQQMusicLite`（单曲搜索一直在用的同一通道，桥里叫 qq_raw/musicu）。
//   - 联想：QQ smartbox JSON（没有 CORS 头，安卓走原生 OkHttp，桌面/网页退回 fetch）。
// 这样不依赖桥的操作白名单；桥版本旧一点也不会退化成「未实现」。

const MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const SMARTBOX_URL = 'https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const TYPE_CODE = { song: 0, singer: 1, album: 2, playlist: 3 } as const;
const LIST_KEY = { song: 'item_song', singer: 'singer', album: 'item_album', playlist: 'item_songlist' } as const;

type QqSearchType = keyof typeof TYPE_CODE;

const searchId = () => `${Math.floor(Math.random() * 9 + 1)}${Array.from({ length: 17 }, () => Math.floor(Math.random() * 10)).join('')}`;

const musicuComm = () => ({
    ct: 11, cv: '1003006', v: '1003006', tmeAppID: 'qqmusiclight',
    nettype: 'NETWORK_WIFI', udid: '0', uid: '0',
});

const isElectron = typeof window !== 'undefined' && Boolean((window as any).electron);
const configuredBase = () => (typeof import.meta !== 'undefined'
    ? String((import.meta as any).env?.VITE_QQ_API_BASE || '')
    : '');

/** 与单曲搜索一致的通道：网页/安卓桥走 qq_raw musicu，Electron 走直连。 */
const requestMusicu = async (payload: unknown): Promise<any> => {
    const base = configuredBase();
    if (!isElectron && (isFoliaExtensionBridgeConfigured(base) || !base) && await isFoliaExtensionBridgeAvailable()) {
        const body = await requestFoliaExtension<any>({ provider: 'qq_raw', operation: 'musicu', method: 'POST', body: payload });
        if (body?.__foliaBridgeError) throw new Error(String(body.message || body.__foliaBridgeError));
        if (Number(body?.code) !== 0 || Number(body?.request?.code) !== 0) {
            throw new Error(`QQ musicu error: ${body?.code ?? body?.request?.code}`);
        }
        return body.request?.data ?? {};
    }
    const target = `${MUSICU_URL}?format=json`;
    const url = isElectron ? target : `/api/lyric-proxy?url=${encodeURIComponent(target)}`;
    const response = await fetch(url, {
        method: 'POST',
        credentials: isElectron ? 'omit' : 'same-origin',
        headers: { 'Content-Type': 'application/json', Cookie: 'tmeLoginType=-1;', 'User-Agent': 'okhttp/3.14.9' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`QQ musicu request failed: ${response.status}`);
    const body = await response.json();
    if (Number(body?.code) !== 0 || Number(body?.request?.code) !== 0) {
        throw new Error(`QQ musicu error: ${body?.code ?? body?.request?.code}`);
    }
    return body.request?.data ?? {};
};

export interface QqTypedPage {
    items: unknown[];
    total?: number;
    more: boolean;
}

/** 按类型搜索；返回上游原始条目，由 provider 的纯映射函数转成听屿模型。 */
export const searchQqMusicByType = async (
    type: QqSearchType,
    keyword: string,
    limit: number,
    offset: number,
): Promise<QqTypedPage> => {
    const query = keyword.trim().slice(0, 60);
    const pageSize = Math.max(1, Math.min(20, Math.floor(limit) || 20));
    const page = Math.floor(Math.max(0, offset) / pageSize) + 1;
    if (!query) return { items: [], total: 0, more: false };

    const data = await requestMusicu({
        comm: musicuComm(),
        request: {
            module: 'music.search.SearchCgiService',
            method: 'DoSearchForQQMusicLite',
            param: {
                search_id: searchId(), remoteplace: 'search.android.keyboard', query,
                search_type: TYPE_CODE[type], num_per_page: pageSize, page_num: page,
                highlight: 0, nqc_flag: 0, page_id: 1, grp: 1,
            },
        },
    });
    const list = (data.body || {})[LIST_KEY[type]];
    const total = Number(data.meta?.sum);
    if (!Array.isArray(list) && total !== 0) throw new Error('QQ typed search returned an invalid result model');
    const items = Array.isArray(list) ? list : [];
    const nextPage = Number(data.meta?.nextpage);
    return {
        items,
        ...(Number.isFinite(total) && total >= 0 ? { total } : {}),
        more: items.length > 0 && (Number.isFinite(nextPage) ? nextPage > 0 : Number.isFinite(total) ? offset + items.length < total : items.length >= pageSize),
    };
};

/** smartbox JSON：安卓 WebView 直接 fetch 会被 CORS 拦，优先走原生 OkHttp。 */
const fetchSmartboxJson = async (url: string): Promise<any> => {
    const plugin = (typeof window !== 'undefined' ? (window as any).Capacitor?.Plugins?.FoliaNative : null);
    if (plugin?.httpRequest) {
        try {
            const result = await plugin.httpRequest({
                url, method: 'GET', headers: { Referer: 'https://y.qq.com/' },
                bodyText: '', bodyBase64: '', redirect: 'follow',
            });
            if (result && result.status >= 200 && result.status < 300 && result.bodyBase64) {
                const binary = atob(result.bodyBase64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
                return JSON.parse(new TextDecoder('utf-8').decode(bytes));
            }
        } catch (error) {
            console.warn('[QQ search] native smartbox failed, falling back to fetch', error);
        }
    }
    const response = await fetch(url, {
        headers: { Referer: 'https://y.qq.com/', 'User-Agent': UA },
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`QQ smartbox request failed: ${response.status}`);
    return await response.json();
};

/** 返回上游 smartbox 分组（song / singer / album），不在这一层发明搜索词。 */
export const fetchQqSmartbox = async (keyword: string): Promise<{ data: any }> => {
    const key = keyword.trim().slice(0, 60);
    if (!key) return { data: {} };
    const url = new URL(SMARTBOX_URL);
    Object.entries({
        format: 'json', key, g_tk: '5381', loginUin: '0', hostUin: '0',
        inCharset: 'utf8', outCharset: 'utf-8', notice: '0', platform: 'yqq.json', needNewCode: '0',
    }).forEach(([name, value]) => url.searchParams.set(name, value));
    const base = configuredBase().replace(/\/+$/, '');
    // 配置了真实后端（本地开发或自建 qq-music-api）时用它的现行路由；否则走原生/直连。
    const json = base && !isFoliaExtensionBridgeConfigured(base)
        ? await (async () => {
            const response = await fetch(`${base}/getSmartbox?key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) });
            if (!response.ok) throw new Error(`QQ smartbox request failed: ${response.status}`);
            const body = await response.json();
            // 后端包一层 response；原生直连返回平铺对象，两种都认。
            return body?.response ?? body;
        })()
        : await fetchSmartboxJson(url.toString());
    if (!json || Number(json.code) !== 0 || !json.data) throw new Error(`QQ smartbox failed: ${json?.code}`);
    return { data: json.data };
};

export type { SearchAlbumHit, SearchArtistHit, SearchPlaylistHit, SearchSuggestions };
