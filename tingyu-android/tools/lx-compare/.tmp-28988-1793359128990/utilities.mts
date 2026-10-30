import CryptoJS from 'crypto-js';

// src/services/lxSource/utilities.ts
const bytes = (data: unknown): Uint8Array => Uint8Array.from(Array.isArray(data) ? data.slice(0, 1048576) : []);
const words = (data: unknown) => CryptoJS.lib.WordArray.create(bytes(data));
const array = (value: CryptoJS.lib.WordArray) => Array.from({ length: value.sigBytes }, (_, i) => (value.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 255);
function from(data: unknown, format: string): number[] {
    if (Array.isArray(data) || data && typeof data === 'object') return Array.from(bytes(data));
    const value = String(data ?? '');
    if (format === 'hex') return array(CryptoJS.enc.Hex.parse(value));
    if (format === 'base64') return array(CryptoJS.enc.Base64.parse(value));
    return Array.from(new TextEncoder().encode(value));
}
export function lxUtility(input: string): string {
    try {
        const { op, args } = JSON.parse(input);
        let value: unknown;
        if (op === 'buffer') value = from(args[0], args[1]);
        else if (op === 'string') value = words(args[0]).toString(args[1] === 'base64' ? CryptoJS.enc.Base64 : args[1] === 'hex' ? CryptoJS.enc.Hex : CryptoJS.enc.Utf8);
        else if (op === 'md5') value = CryptoJS.MD5(typeof args[0] === 'string' ? args[0] : words(args[0])).toString();
        else if (op === 'random') { const length = Number(args[0]); if (!Number.isInteger(length) || length < 0 || length > 4096) throw Error('randomBytes size invalid'); value = Array.from(crypto.getRandomValues(new Uint8Array(length))); }
        else if (op === 'aes') {
            const mode = String(args[1]).toLowerCase();
            if (!['aes-128-cbc','aes-128-ecb','aes-256-cbc','aes-256-ecb'].includes(mode)) throw Error('AES mode unsupported');
            value = array(CryptoJS.AES.encrypt(words(args[0]), words(args[2]), { iv: words(args[3]), mode: mode.endsWith('ecb') ? CryptoJS.mode.ECB : CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).ciphertext);
        } else throw Error('Unsupported LX utility');
        return JSON.stringify({ value });
    } catch (error) { return JSON.stringify({ error: String(error) }); }
}
