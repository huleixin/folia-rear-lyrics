import type { LyricData } from '../types';

// src/services/lyricSegmentationWorker.ts
let worker: Worker | null = null;
let sequence = 0;
const pending = new Map<number, { resolve: (value: string[][] | null) => void; timer: ReturnType<typeof setTimeout> }>();
const results = new Map<string, Promise<string[][] | null>>();
export function segmentLyricsOffThread(texts: string[]): Promise<string[][] | null> {
    const key = JSON.stringify(texts);
    const cached = results.get(key);
    if (cached) return cached;
    if (typeof Worker === 'undefined') return Promise.resolve(null);
    try {
        if (!worker) {
            worker = new Worker(new URL('../utils/lyrics/icuFolia/segmentation.worker.ts', import.meta.url), { type: 'module' });
            worker.onmessage = ({ data }) => {
                const task = pending.get(data.id);
                if (!task) return;
                pending.delete(data.id); clearTimeout(task.timer);
                task.resolve(data.error ? null : data.segments);
            };
            worker.onerror = () => {
                for (const task of pending.values()) { clearTimeout(task.timer); task.resolve(null); }
                pending.clear(); results.clear(); worker?.terminate(); worker = null;
            };
        }
        const id = ++sequence;
        const promise = new Promise<string[][] | null>(resolve => {
            const timer = setTimeout(() => { pending.delete(id); results.delete(key); resolve(null); }, 30_000);
            pending.set(id, { resolve, timer });
            worker!.postMessage({ id, texts });
        });
        if (results.size >= 8) results.delete(results.keys().next().value!);
        results.set(key, promise);
        void promise.then(value => { if (!value) results.delete(key); });
        return promise;
    } catch { return Promise.resolve(null); }
}

/** Text matching rejects stale worker replies without losing newer timing/translation edits. */
export function applySegmentResults(lyrics: LyricData | null, texts: string[], segments: string[][]): LyricData | null {
    if (!lyrics || lyrics.lines.length !== texts.length || segments.length !== texts.length
        || lyrics.lines.some((line, i) => line.fullText !== texts[i])) return lyrics;
    let changed = false;
    const lines = lyrics.lines.map((line, i) => {
        const words = segments[i];
        if (!line.fullText || !Array.isArray(words) || words.join('') !== line.fullText
            || line.autoWordSegments?.length === words.length && words.every((word, j) => word === line.autoWordSegments![j])) return line;
        changed = true;
        return { ...line, autoWordSegments: words };
    });
    return changed ? { ...lyrics, lines } : lyrics;
}
