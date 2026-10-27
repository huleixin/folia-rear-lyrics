import type { AudioQualityPreference } from '../../types/onlineMusic';

// src/services/lxSource/contract.ts
export const LX_QUALITIES = ['128k', '320k', 'flac', 'flac24bit'] as const;
export type LxQuality = typeof LX_QUALITIES[number];
export interface LxCapability { name: string; qualitys: LxQuality[] }
export type LxCapabilities = Record<string, LxCapability>;
export interface LxScript { id: string; name: string; version: string; description: string; author: string; homepage: string; code: string; capabilities: LxCapabilities }
export function parseLxScript(code: string): Omit<LxScript, 'capabilities'> {
    if (new TextEncoder().encode(code).length > 1024 * 1024) throw new Error('音源脚本不能超过 1 MB');
    const header = code.replace(/^\uFEFF/, '').match(/^\s*\/\*\*?([\s\S]*?)\*\//)?.[1] || '';
    const field = (key: string) => (header.match(new RegExp('@' + key + '\\s+([^\\r\\n]+)'))?.[1] || '').trim().slice(0, 160);
    if (!field('name')) throw new Error('缺少脚本头部 @name');
    return { id: crypto.randomUUID(), name: field('name'), version: field('version'), description: field('description'), author: field('author'), homepage: field('homepage'), code };
}
export function validateCapabilities(value: unknown): LxCapabilities {
    const result: LxCapabilities = {};
    if (!value || typeof value !== 'object') throw new Error('音源未声明支持的平台');
    for (const [key, item] of Object.entries(value)) {
        if (!['kw','kg','tx','wy','mg'].includes(key) || !item || typeof item !== 'object') continue;
        if (item.type !== 'music' || !Array.isArray(item.actions) || !item.actions.includes('musicUrl')) continue;
        const qualitys = LX_QUALITIES.filter(q => Array.isArray(item.qualitys) && item.qualitys.includes(q));
        if (qualitys.length) result[key] = { name: String(item.name || key).slice(0, 60), qualitys };
    }
    if (!Object.keys(result).length) throw new Error('此脚本没有可用的 musicUrl 平台');
    return result;
}
export function chooseLxQuality(preference: AudioQualityPreference, supported: readonly LxQuality[]): LxQuality {
    const target = ['standard','high','lossless','hires'].indexOf(preference);
    for (let i = target; i >= 0; i--) if (supported.includes(LX_QUALITIES[i])) return LX_QUALITIES[i];
    const first = LX_QUALITIES.find(q => supported.includes(q));
    if (!first) throw new Error('音源不支持此音质');
    return first;
}
export function validateRemoteUrl(input: string): string {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !host.includes('.') ||
        /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.endsWith('.local') || host.includes(':')) throw new Error('音源地址必须为公网 HTTP(S) 地址');
    return url.href;
}
