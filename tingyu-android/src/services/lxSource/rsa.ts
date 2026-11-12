// src/services/lxSource/rsa.ts
// Mobile uses RSA/ECB/NoPadding with an SPKI public key. No private-key API.
export function rsaEncrypt(data: Uint8Array, pem: unknown): number[] {
    if (typeof pem !== 'string' || pem.length > 16384) throw Error('Invalid RSA key');
    const raw = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
    const read = (offset: number) => {
        const tag = raw[offset++]; let length = raw[offset++];
        if (length & 128) { const count = length & 127; if (count > 4) throw Error('Invalid RSA key'); length = 0; for (let i = 0; i < count; i++) length = length * 256 + raw[offset++]; }
        if (!Number.isFinite(length) || offset + length > raw.length) throw Error('Invalid RSA key');
        return {tag, start: offset, end: offset + length};
    };
    let root = read(0), first = read(root.start);
    if (root.tag !== 48) throw Error('Invalid RSA key');
    if (first.tag === 48) { const bit = read(first.end); if (bit.tag !== 3 || raw[bit.start] !== 0) throw Error('Invalid RSA key'); root = read(bit.start + 1); first = read(root.start); }
    const second = read(first.end);
    if (first.tag !== 2 || second.tag !== 2) throw Error('Invalid RSA key');
    const integer = (v: Uint8Array) => BigInt('0x' + Array.from(v, b => b.toString(16).padStart(2,'0')).join(''));
    const modulusBytes = raw.slice(first.start + (raw[first.start] === 0 ? 1 : 0), first.end);
    if (modulusBytes.length < 64 || modulusBytes.length > 1024 || data.length > modulusBytes.length || second.end - second.start > 4) throw Error('RSA size invalid');
    const modulus = integer(modulusBytes); let exponent = integer(raw.slice(second.start, second.end));
    let base = data.length ? integer(data) : 0n, result = 1n;
    if (base >= modulus || exponent < 3n) throw Error('RSA input out of range');
    while (exponent) { if (exponent & 1n) result = result * base % modulus; base = base * base % modulus; exponent >>= 1n; }
    const hex = result.toString(16).padStart(modulusBytes.length * 2,'0');
    return Array.from({length: modulusBytes.length}, (_, i) => parseInt(hex.slice(i*2,i*2+2),16));
}
