import { OnlineProviderError } from '../../types/onlineMusic';
import { readProviderSessionValue, removeProviderSessionValue, writeProviderSessionValue } from './providerStorage';
import {
    isFoliaExtensionBridgeConfigured,
    requestFoliaExtension,
} from '../foliaExtensionBridge';

// src/services/onlineMusic/qqTransport.ts

export const QQ_OPERATIONS = [
    'toplist_list', 'toplist_detail',
    'search_hot', 'search', 'smartbox',
    'login_qr_key', 'login_qr_create', 'login_qr_check', 'login_qr_cancel', 'login_status', 'logout',
    'login_channels',
    'user_detail', 'user_playlist', 'user_albums', 'user_liked_songs', 'user_playlist_detail',
    'user_guess_you_like', 'user_daily_songs', 'recommend_playlists',
    'user_playlist_tracks', 'user_playlist_subscribe', 'user_subscription_status',
    'user_song_like', 'user_album_subscribe',
    'music_play', 'song_list_detail', 'song_info',
    'album_info', 'artist_albums', 'artist_songs',
] as const;

export type QqOperation = typeof QQ_OPERATIONS[number];
export type QqParams = Record<string, string | number | boolean | undefined>;

// 写入路由只收 POST + JSON 正文；GET 会回 405。
const POST_OPERATIONS: ReadonlySet<QqOperation> = new Set<QqOperation>([
    'user_playlist_tracks', 'user_playlist_subscribe', 'user_song_like', 'user_album_subscribe',
]);

const ENDPOINTS: Record<QqOperation, string> = {
    toplist_list: '/getTopLists',
    toplist_detail: '/getRanks',
    search_hot: '/getHotkey',
    // 3.3.x 的 `/search` 一次按 type 搜一类；`/getSmartbox` 是输入联想。两条都是只读路由。
    search: '/search',
    smartbox: '/getSmartbox',
    login_qr_key: '/login/qr/key',
    login_qr_create: '/login/qr/create',
    login_qr_check: '/login/qr/check',
    login_qr_cancel: '/login/qr/cancel',
    login_status: '/login/status',
    logout: '/logout',
    // 只有 3.0.0 之后的后端有这条路由，旧后端回 404，调用方要把它当成「没有声明」而不是错误。
    login_channels: '/login/channels',
    user_detail: '/user/detail',
    user_playlist: '/user/playlist',
    user_albums: '/user/albums',
    user_liked_songs: '/user/liked-songs',
    // 带凭据地读登录用户自己的歌单。匿名的 `song_list_detail` 读不了不公开的歌单，这条可以。
    // 与 `login_channels` 同样的处境：旧后端没有这条路由，回 404，调用方要当成「没有声明」。
    user_playlist_detail: '/user/playlist-detail',
    // 以下是 3.2.0 / 3.3.0 新增的路由：推荐三条要登录（推荐歌单可匿名），写入两条只对本人的歌单生效。
    // 旧后端一律 404，transport 照例报成 `unsupported`，由调用方决定回落还是报错。
    user_guess_you_like: '/user/guess-you-like',
    user_daily_songs: '/user/daily-songs',
    recommend_playlists: '/recommend/playlists',
    user_playlist_tracks: '/user/playlist/tracks',
    user_playlist_subscribe: '/user/playlist/subscribe',
    user_subscription_status: '/user/subscription-status',
    // 3.3.1 的红心与收藏专辑：写一次、读回确认后才回成功，结果不明回 502。
    user_song_like: '/user/song/like',
    user_album_subscribe: '/user/album/subscribe',
    music_play: '/getMusicPlay',
    song_list_detail: '/getSongListDetail',
    song_info: '/getSongInfo',
    // 曲库端点用领域语汇命名，与 provider 的 getAlbum* / getArtist* 一一对应，不沿用上游的 singer_* 路径名。
    // 上游这三条路由虽然声明了路径参数，但 controller 只读 ctx.query，所以一律走 query string。
    album_info: '/getAlbumInfo',
    artist_albums: '/getSingerAlbum',
    artist_songs: '/getSingerHotsong',
};

// qq-music-api translates the native QR states into the Netease codes; 803 is the only one carrying a session.
const QR_CONFIRMED_CODE = 803;

const getWebApiBase = (): string => {
    const viteValue = typeof import.meta !== 'undefined' && import.meta.env?.MODE !== 'test'
        ? String((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_QQ_API_BASE || '')
        : '';
    const processValue = typeof process !== 'undefined'
        ? String(process.env?.VITE_QQ_API_BASE || '')
        : '';
    const value = viteValue || processValue;
    return value.trim().replace(/\/$/, '');
};

// Electron embeds qq-music-api and starts it on a free port, so the base is only known at runtime.
const getElectronQqPortReader = (): (() => Promise<number | null>) | null => {
    if (typeof window === 'undefined') return null;
    const reader = window.electron?.getQqPort;
    return typeof reader === 'function' ? () => reader() : null;
};

let electronApiBase: string | null = null;

export const resetQqTransportRuntimeCache = (): void => {
    electronApiBase = null;
};

// 内嵌后端没在监听时，把主进程报的状态与故障原因带进错误：时间线里直接能看到它为什么没起来。
const describeEmbeddedStatus = async (): Promise<string> => {
    try {
        const status = await window.electron?.getQqApiStatus?.();
        return status ? ` (status ${status.status}${status.error ? `: ${status.error}` : ''})` : '';
    } catch {
        return '';
    }
};

const resolveApiBase = async (): Promise<string> => {
    const readPort = getElectronQqPortReader();
    if (readPort) {
        if (electronApiBase) return electronApiBase;
        const port = await readPort();
        if (!port) {
            // 内嵌后端可能还在启动或刚崩溃重启，持久与否证实不了，所以不写 transient。
            throw new OnlineProviderError(
                'unavailable',
                `Embedded QQMusicApi is not running${await describeEmbeddedStatus()}`,
                'qq',
                undefined,
                undefined,
                undefined,
                { stage: 'backend' },
            );
        }
        electronApiBase = `http://127.0.0.1:${port}`;
        return electronApiBase;
    }

    const base = getWebApiBase();
    if (!base) {
        // 网页版没配后端地址：重试不会变好，transient:false 让播放侧显示「未配置」而不是「稍后再试」。
        throw new OnlineProviderError(
            'unavailable',
            'VITE_QQ_API_BASE is not configured',
            'qq',
            undefined,
            undefined,
            undefined,
            { stage: 'config', transient: false },
        );
    }
    return base;
};

// The stored value is the backend's opaque `qqmusic_session=<token>` string, never a QQ credential.
const getWebSessionCookie = (): string => readProviderSessionValue('qq', 'cookie') || '';

const SESSION_COOKIE_NAME = 'qqmusic_session';
const SESSION_HEADER_NAME = 'X-QQ-Session';

// 后端两个入口的语义不同，不能互换：header 收的是裸 token，`?cookie=` 收的是整串 cookie。
const tokenFromCookieString = (cookie: string): string => {
    for (const entry of cookie.split(';')) {
        const separator = entry.indexOf('=');
        if (separator <= 0) continue;
        if (entry.slice(0, separator).trim() === SESSION_COOKIE_NAME) return entry.slice(separator + 1).trim();
    }
    return '';
};

// 同源部署（`/api/qq`、`/qq`）改走 header：sealed token 是密文本身，query 是它唯一会被 CDN 与
// edge access log 完整记下来的地方 —— 那是 sealed 相对不透明 token 唯一真正新增的泄漏面。
// 外部 URL 与 Electron 维持 `?cookie=`：跨源发自定义头会触发 preflight，而后端是
// `Access-Control-Allow-Origin: *`，按规范不允许搭配 credentials。
const isSameOriginBase = (base: string): boolean => base.startsWith('/');

export const hasQqExtensionSession = (): boolean => isFoliaExtensionBridgeConfigured(getWebApiBase());
export const hasQqSession = (): boolean => hasQqExtensionSession() || Boolean(getWebSessionCookie());

export const clearQqSession = (): void => removeProviderSessionValue('qq', 'cookie');

// 后端的退避时长（qq-music-api 在 429 的响应体里给 retryAfterMs，同时带 Retry-After 头，单位是秒）。
// 只收非负安全整数，读不出就不给，调用方按普通失败处理。
const readRetryAfterMs = (body: unknown, response: Response): number | undefined => {
    const fromBody = body && typeof body === 'object' ? (body as { retryAfterMs?: unknown }).retryAfterMs : undefined;
    if (typeof fromBody === 'number' && Number.isSafeInteger(fromBody) && fromBody >= 0) return fromBody;
    const raw = response.headers?.get?.('Retry-After')?.trim();
    if (!raw || !/^\d+$/.test(raw)) return undefined;
    const seconds = Number(raw);
    return Number.isSafeInteger(seconds * 1000) ? seconds * 1000 : undefined;
};

const readJsonBody = async (response: Response): Promise<any> => {
    try {
        return await response.json();
    } catch {
        return undefined;
    }
};

// 后端失败正文的原文：多数路由写在 `message`，播放等路由的 500 只给 `{ error }`（observability.js），两处都认。
// 3.2.0 起的新路由另带固定的 `errorKey`（如 `playlist.already-applied`）与可选的上游数字码，`message` 只是通用英文，
// 所以把这两样一起写进原文，诊断里才看得出是哪一类失败。
const readBackendMessage = (failure: any): string => {
    let text = '';
    for (const candidate of [failure?.message, failure?.error]) {
        if (typeof candidate === 'string' && candidate.trim()) {
            text = candidate.trim();
            break;
        }
    }
    const errorKey = typeof failure?.errorKey === 'string' ? failure.errorKey.trim() : '';
    const upstreamCode = Number.isSafeInteger(failure?.upstreamCode) ? ` upstream ${failure.upstreamCode}` : '';
    if (!errorKey) return text;
    return `${errorKey}${upstreamCode}${text ? `: ${text}` : ''}`;
};

// 后端对没配好的能力回 501（serverless 入口缺少配置），重试不会变好，与普通 5xx 分开。
const HTTP_NOT_IMPLEMENTED = 501;

// qq-music-api 的 QqProtocolError 模板（dist/src/services/auth/qrLogin.js 的 callMusicu）：musicu 已经应答（HTTP 2xx），
// 只是带了非零的全局码或 req_0 码，后端的 handleControllerError 一律把它包成 500 `{ error }`。
const QQ_PROTOCOL_REFUSAL = /\bfailed \(HTTP 2\d\d, global=(-?\d+), code=(-?\d+|unknown)\)/;

// 从 500 正文里认出「上游有应答、只是业务拒绝」，返回诊断用的上游码：req_0 的码优先，缺失时退回全局码，
// 两者都没有（应答里没有 req_0）记作 'missing'。认不出就返回 undefined，按普通 5xx 处理。
const readUpstreamRefusalCode = (backendText: string): number | string | undefined => {
    const match = QQ_PROTOCOL_REFUSAL.exec(backendText);
    if (!match) return undefined;
    const [, globalCode, requestCode] = match;
    if (requestCode !== 'unknown' && Number(requestCode) !== 0) return Number(requestCode);
    if (Number(globalCode) !== 0) return Number(globalCode);
    return 'missing';
};

// 曲库三条路由被上游拒收时仍然回 HTTP 200，状态码藏在响应体里，而且层级还不一样：
// `/getAlbumInfo` 直接是 `response.code`（参数类型错时是 1101 `para error!`），
// 两条歌手路由的 `response.code` 恒为 0，真正的状态在 `response.singer.code`（400 / 104400）。
// 不看这两层就会把「被拒收」当成「这个专辑没有曲目」，UI 只剩一片空白，线上很难定位。
// 登录与播放路由用的是另一套码值（如 `login_status` 回 200），故不纳入此检查。
const CATALOG_STATUS_NODES: Partial<Record<QqOperation, string[][]>> = {
    album_info: [['response']],
    // 歌单详情的上游是匿名 CGI：歌单不存在、不公开或参数不被接受时它照样回 HTTP 200，
    // 差别只在这个 `code` 上。不登记的话拒绝会一路变成空歌单，UI 只剩「暂无内容」。
    song_list_detail: [['response']],
    artist_songs: [['response'], ['response', 'singer']],
    artist_albums: [['response'], ['response', 'singer']],
};

const readNode = (body: any, path: string[]): any => (
    path.reduce((node, key) => (node === null || node === undefined ? node : node[key]), body)
);

const assertUpstreamAccepted = (operation: QqOperation, body: any): void => {
    for (const path of CATALOG_STATUS_NODES[operation] ?? []) {
        const node = readNode(body, path);
        const code = Number(node?.code);
        if (!Number.isFinite(code) || code === 0) continue;

        const subcode = Number(node?.subcode);
        const message = typeof node?.message === 'string' ? node.message.trim() : '';
        throw new OnlineProviderError(
            'invalid-response',
            `QQMusicApi ${operation} was rejected upstream at ${path.join('.')} (code ${code}`
            + `${Number.isFinite(subcode) && subcode !== code ? `, subcode ${subcode}` : ''})`
            + `${message ? `: ${message}` : ''}`,
            'qq',
            node,
        );
    }
};

const persistConfirmedSession = (operation: QqOperation, body: any): void => {
    if (operation !== 'login_qr_check' || Number(body?.code) !== QR_CONFIRMED_CODE) return;
    const cookie = body?.cookie;
    if (typeof cookie === 'string' && cookie) writeProviderSessionValue('qq', 'cookie', cookie);
};

/** 网页版配置的远端 API 地址（自检与诊断报告用）；桌面版走内嵌后端，返回 null。 */
export const getQqRemoteApiBase = (): string | null => (getElectronQqPortReader() ? null : getWebApiBase() || null);

export const getQqTransportAvailability = () => {
    if (getElectronQqPortReader()) return { configured: true } as const;
    if (hasQqExtensionSession()) return { configured: true } as const;
    return getWebApiBase()
        ? { configured: true } as const
        : { configured: false, reason: 'not-configured' as const };
};

const endpointFor = (operation: QqOperation, params: QqParams): { path: string; query: QqParams } => {
    const query = { ...params };
    const takeRequiredPathParam = (name: string): string => {
        const value = query[name];
        delete query[name];
        const pathValue = value === undefined ? '' : String(value).trim();
        if (!pathValue) {
            throw new OnlineProviderError(
                'invalid-response',
                `QQMusicApi ${operation} requires ${name}`,
                'qq',
            );
        }
        return encodeURIComponent(pathValue);
    };

    if (operation === 'music_play') {
        return { path: `${ENDPOINTS[operation]}/${takeRequiredPathParam('songmid')}`, query };
    }
    if (operation === 'song_list_detail') {
        return { path: `${ENDPOINTS[operation]}/${takeRequiredPathParam('disstid')}`, query };
    }
    if (operation === 'song_info') {
        const songmid = takeRequiredPathParam('songmid');
        const songid = query.songid;
        delete query.songid;
        return {
            path: `${ENDPOINTS[operation]}/${songmid}${songid === undefined ? '' : `/${encodeURIComponent(String(songid))}`}`,
            query,
        };
    }
    return { path: ENDPOINTS[operation], query };
};

// Routes one provider request through the embedded Electron server or the configured Web base URL.
// 写入路由（POST_OPERATIONS）的参数放在 JSON 正文 `payload` 里；会话照旧走 header 或 `?cookie=`，后端两条路由都认。
export const requestQq = async <T = unknown>(
    operation: QqOperation,
    params: QqParams = {},
    payload?: Record<string, unknown>,
): Promise<T> => {
    const isPost = POST_OPERATIONS.has(operation);
    if (isPost !== (payload !== undefined)) {
        throw new OnlineProviderError(
            'invalid-response',
            `QQMusicApi ${operation} ${isPost ? 'requires' : 'does not take'} a request body`,
            'qq',
        );
    }
    const base = await resolveApiBase();

    const endpoint = endpointFor(operation, params);
    if (isFoliaExtensionBridgeConfigured(base)) {
        try {
            // 写入路由（POST_OPERATIONS）必须把正文一起交给内置桥：它按 input.body 并进 params，
            // 只发 GET + 空正文会让写入类操作在桥里被判成 bad input，界面看到的是「操作失败」。
            const body = await requestFoliaExtension<any>({
                provider: 'qq',
                operation,
                method: isPost ? 'POST' : 'GET',
                path: endpoint.path,
                params: endpoint.query,
                ...(payload !== undefined ? { body: payload } : {}),
            });
            if (body?.__foliaBridgeError) {
                if (body.__foliaBridgeError === 'AUTH_REQUIRED') {
                    throw new OnlineProviderError('auth-required', body.message || 'QQMusicApi login required', 'qq', body);
                }
                if (body.__foliaBridgeError === 'UNSUPPORTED') {
                    throw new OnlineProviderError('unsupported', body.message || `QQMusicApi has no ${operation} route`, 'qq', body);
                }
                throw new OnlineProviderError('network', body.message || body.__foliaBridgeError, 'qq', body);
            }
            persistConfirmedSession(operation, body);
            return body as T;
        } catch (error) {
            if (error instanceof OnlineProviderError) throw error;
            throw new OnlineProviderError('network', error instanceof Error ? error.message : String(error), 'qq', error);
        }
    }

    const query = new URLSearchParams();
    Object.entries(endpoint.query).forEach(([key, value]) => {
        if (value !== undefined) query.set(key, String(value));
    });
    const cookie = getWebSessionCookie();
    const headers: Record<string, string> = {};
    if (cookie) {
        if (isSameOriginBase(base)) {
            const token = tokenFromCookieString(cookie);
            // 同源请求不允许把未知格式的 session 放回 URL；清掉无效值，交给后端按未登录处理。
            if (token) headers[SESSION_HEADER_NAME] = token;
            else clearQqSession();
        } else {
            query.set('cookie', cookie);
        }
    }
    query.set('timestamp', String(Date.now()));

    // Same-origin serverless calls must retain deployment-protection cookies; external qq-music-api instances
    // answer with `Access-Control-Allow-Origin: *`, so those requests still omit browser credentials.
    const credentials: RequestCredentials = isSameOriginBase(base) ? 'same-origin' : 'omit';
    const init: RequestInit = isPost
        ? { method: 'POST', credentials, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        : { credentials, headers };
    let response: Response;
    try {
        response = await fetch(`${base}${endpoint.path}?${query}`, init);
    } catch (error) {
        // 连后端本身都没连上（内嵌后端退出、远端不可达），与后端回了错误码分开。
        throw new OnlineProviderError(
            'network',
            `QQMusicApi ${operation} unreachable: ${error instanceof Error ? error.message : String(error)}`,
            'qq',
            error,
        );
    }
    if (!response.ok) {
        const failure = await readJsonBody(response);
        const backendText = readBackendMessage(failure);
        const backendMessage = backendText ? ` (${backendText})` : '';
        // A missing, expired, rejected, or non-persisted backend session is surfaced uniformly as 401.
        if (response.status === 401) {
            clearQqSession();
            throw new OnlineProviderError('auth-required', 'QQMusicApi login required', 'qq', failure, response.status);
        }
        // 404 是「这个后端没有这条路由」，不是网络故障 —— 用户可以自行部署任意版本的后端，
        // 新路由在旧后端上必然 404。报成 `unsupported`，调用方才能据此回落到旧路径，
        // 而不必去解析错误文案里的状态码。
        if (response.status === 404) {
            throw new OnlineProviderError(
                'unsupported',
                `QQMusicApi has no ${operation} route`,
                'qq',
                failure,
                response.status,
            );
        }
        // 3.2.0 起网关码与凭证拒绝码同时出现时，带凭证的旧路由（取链、歌单、登录态）改回 502，正文仍是同一个协议模板
        // （GatewayCredentialConflictError）。新路由的 502 带 errorKey，是另一套信封，不在这里认。
        const isLegacyRefusalStatus = response.status === 500
            || (response.status === 502 && typeof failure?.errorKey !== 'string');
        const upstreamCode = isLegacyRefusalStatus ? readUpstreamRefusalCode(backendText) : undefined;
        if (upstreamCode !== undefined) {
            // 这个 500 / 502 只是后端的外壳，上游其实应答了：与酷狗 Web 端的 502 同理不传 httpStatus、带上 upstreamCode，
            // 分类器读成 unknown（暂时无法播放），汇总也不把它算作服务异常，不触发 provider 冷却。
            throw new OnlineProviderError(
                'network',
                `QQMusicApi ${operation} failed: HTTP ${response.status}${backendMessage}`,
                'qq',
                failure,
                undefined,
                readRetryAfterMs(failure, response),
                { stage: 'upstream', upstreamCode },
            );
        }
        throw new OnlineProviderError(
            'network',
            `QQMusicApi ${operation} failed: HTTP ${response.status}${backendMessage}`,
            'qq',
            failure,
            response.status,
            readRetryAfterMs(failure, response),
            response.status === HTTP_NOT_IMPLEMENTED ? { stage: 'config', transient: false } : undefined,
        );
    }

    const body = await readJsonBody(response);
    if (body === undefined) {
        throw new OnlineProviderError('invalid-response', `QQMusicApi returned an unreadable ${operation} body`, 'qq');
    }
    assertUpstreamAccepted(operation, body);
    persistConfirmedSession(operation, body);
    return body as T;
};

/**
 * 原生解析器要用的同一份会话串与后端地址。
 *
 * 只由 {@link ../../services/nativePlaylistSync.ts} 调用，交给原生后**只存在内存里**，不落盘。
 * `extension`（浏览器扩展桥）在原生侧没有对应物，调用方必须过滤掉。
 */
export const readQqNativeResolverConfig = (): { base: string; cookie: string } => {
    if (getElectronQqPortReader()) return { base: '', cookie: '' };
    const base = getWebApiBase();
    if (!base || /^extension$/i.test(base.trim()) || base.startsWith('/')) return { base: '', cookie: '' };
    return { base, cookie: getWebSessionCookie() };
};
