// src/services/shuffleCycle.ts
// Same unsigned hash/LCG as ShuffleCycle.java: previews and background rounds agree.
export function nextShuffleCycle(order: string[]): string[] {
    let seed = 2166136261;
    for (const key of order) {
        for (let i = 0; i < key.length; i++) seed = Math.imul(seed ^ key.charCodeAt(i), 16777619) >>> 0;
        seed = Math.imul(seed ^ 0, 16777619) >>> 0;
    }
    const result = [...order];
    for (let i = result.length - 1; i > 0; i--) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const j = seed % (i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    if (result.length > 1 && result[0] === order[order.length - 1])
        [result[0], result[1]] = [result[1], result[0]];
    return result;
}
