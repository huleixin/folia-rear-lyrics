// 双引擎对照台用的 @capacitor/core 替身。
//
// 真机上的 WebView 路径是 http.ts → CapacitorHttp（安卓侧 OkHttp 插件）。
// 这里把 CapacitorHttp 接到 Node 的 fetch 上，**同时记录每一个请求**，
// 但不改 http.ts 一行代码 —— 记录到的是 http.ts 真正交给桥的东西。
export const records = [];

export const Capacitor = { isNativePlatform: () => true };

export const CapacitorHttp = {
    async request(options) {
        const started = Date.now();
        const response = await fetch(options.url, {
            method: options.method,
            headers: options.headers,
            body: options.method === 'GET' || options.method === 'HEAD' ? undefined : options.data,
            redirect: options.disableRedirects ? 'manual' : 'follow',
            signal: AbortSignal.timeout(Math.max(Number(options.connectTimeout) || 15000, Number(options.readTimeout) || 15000)),
        });
        const text = await response.text();
        const record = {
            method: String(options.method || 'GET').toUpperCase(),
            url: redactUrl(options.url),
            host: hostOf(options.url),
            path: pathOf(options.url),
            queryKeys: queryKeysOf(options.url),
            contentType: contentTypeOf(options.headers),
            body: redactBody(options.data),
            optionKeys: '',
            status: response.status,
            ms: Date.now() - started,
        };
        records.push(record);
        return {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            data: text,
            url: response.url,
        };
    },
};

const hostOf = url => { try { return new URL(url).hostname; } catch { return '?'; } };
const pathOf = url => { try { return new URL(url).pathname; } catch { return '/'; } };
const queryKeysOf = url => {
    try { return [...new URL(url).searchParams.keys()].sort().join(','); } catch { return ''; }
};
const contentTypeOf = headers => {
    const key = Object.keys(headers || {}).find(k => k.toLowerCase() === 'content-type');
    return key ? String(headers[key]) : '';
};

function shapeOf(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') return 'num';
    if (typeof value === 'boolean') return 'bool';
    if (typeof value === 'string') return `str(${value.length})`;
    if (Array.isArray(value)) return `arr(${value.length})`;
    return `obj{${Object.keys(value).sort().join(',')}}`;
}

export function redactBody(data) {
    if (data === undefined || data === null || data === '') return '';
    if (typeof data !== 'string') return Object.keys(data).sort().map(k => `${k}:${shapeOf(data[k])}`).join(',');
    try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return Object.keys(parsed).sort().map(k => `${k}:${shapeOf(parsed[k])}`).join(',');
        }
        return `text(len=${data.length})`;
    } catch {
        return `text(len=${data.length})`;
    }
}

export function redactUrl(url) {
    const query = queryKeysOf(url);
    return query ? `${hostOf(url)}${pathOf(url)}?[${query}]` : `${hostOf(url)}${pathOf(url)}`;
}

export function resetRecords() { records.length = 0; }
