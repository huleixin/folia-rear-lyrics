import { expect, it } from 'vitest';
import { equalNativeData, sameNativeEnvelope } from '@/utils/nativePacketData';

// test/unit/utils/nativePacketData.test.ts
it('compares reconstructed JSON while retaining shared row and document references', () => {
    const rows = Array.from({ length: 397 }, (_, id) => ({ id, title: `song ${id}`, image: 'x'.repeat(512) }));
    const a = { sections: [{ items: rows }], playing: false };
    expect(equalNativeData(a, { ...a, sections: [{ items: rows }] })).toBe(true);
    expect(equalNativeData(a, { ...a, playing: true })).toBe(false);
    expect(equalNativeData(a, { ...a, sections: [{ items: rows.map(row => row.id === 180 ? { ...row, title: 'changed' } : row) }] })).toBe(false);
    expect(equalNativeData([1], { 0: 1 })).toBe(false);
    expect(equalNativeData({ a: undefined }, { b: undefined })).toBe(false);
});
it('compares geometry separately without rescanning the canonical payload', () => {
    const model = { key: 'playlist', sections: [] }, first = { model, top: 22, enabled: true };
    expect(sameNativeEnvelope(first, { ...first })).toBe(true);
    expect(sameNativeEnvelope(first, { ...first, top: 0 })).toBe(false);
    expect(sameNativeEnvelope(first, { ...first, model: { ...model } })).toBe(false);
});
