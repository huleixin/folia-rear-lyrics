// src/utils/nativePacketData.ts
// Bridge models are immutable JSON trees. Shared subtrees stop the comparison immediately;
// unlike stringify, unchanged documents/images do not allocate another large string.
export function equalNativeData(a: unknown, b: unknown, depth = 0): boolean {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || depth > 64) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const left = Object.keys(a), right = Object.keys(b);
    if (left.length !== right.length) return false;
    const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
    return left.every(key => Object.prototype.hasOwnProperty.call(y, key) && equalNativeData(x[key], y[key], depth + 1));
}

/** Packet payloads have already been canonicalized; compare only the small envelope here. */
export function sameNativeEnvelope(a: object | undefined, b: object): boolean {
    if (!a) return false;
    const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
    const keys = Object.keys(y);
    return keys.length === Object.keys(x).length && keys.every(key => Object.is(x[key], y[key]));
}
