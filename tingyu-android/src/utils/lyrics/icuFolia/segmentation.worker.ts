import { loadIcuFoliaEngines } from './engines';
import { segmentWithIcuFolia } from './segmenter';

// src/utils/lyrics/icuFolia/segmentation.worker.ts
// Dictionary parsing, trie construction and lyric segmentation never run on Android's UI thread.
const engines = loadIcuFoliaEngines();
const memo = new Map<string, string[]>();
self.onmessage = async ({ data }: MessageEvent<{ id: number; texts: string[] }>) => {
    try {
        const ready = await engines;
        const segments = data.texts.map(text => {
            let value = memo.get(text);
            if (!value) {
                value = text ? segmentWithIcuFolia(text, ready) : [];
                if (memo.size >= 1024) memo.delete(memo.keys().next().value!);
                memo.set(text, value);
            }
            return value;
        });
        self.postMessage({ id: data.id, segments });
    } catch (error) { self.postMessage({ id: data.id, error: String(error) }); }
};
