import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as OpenCC from 'opencc-js';

// dev/icuFolia/icuFoliaDataPlugin.mjs
// Builds icu-folia's Chinese data into two Vite virtual modules, from jieba's own files in
// dev/icuFolia/jieba (see the README there) and OpenCC's tables:
//
//   virtual:icu-folia-dict  jieba's 349k-word dictionary
//   virtual:icu-folia-hmm   jieba's HMM tables, plus the traditional -> simplified character map
//
// Why build time and these shapes: the runtime segmenter (src/utils/lyrics/icuFolia/jieba.ts) looks
// words up by binary search in one sorted string, so the dictionary costs a few MB of memory instead
// of the ~90 MB jieba-wasm's hash maps took, and there is nothing to parse or sort at load - decoding
// is a single pass. The two modules are separate chunks so each stays under the PWA precache's 5 MB
// per-file limit, and both load only when icu-folia does.

export const DICT_MODULE_ID = 'virtual:icu-folia-dict';
export const HMM_MODULE_ID = 'virtual:icu-folia-hmm';
const RESOLVED = new Map([DICT_MODULE_ID, HMM_MODULE_ID].map(id => [id, `\0${id}`]));

const JIEBA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'jieba');

/** The two large tables are committed gzipped (see jieba/README.md); the small ones stay plain. */
const dataPath = (file) => path.join(JIEBA_DIR, fs.existsSync(path.join(JIEBA_DIR, `${file}.gz`)) ? `${file}.gz` : file);
const readData = (file) => {
    const raw = fs.readFileSync(dataPath(file));
    return (dataPath(file).endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8');
};

/** Code-unit order, which is what the runtime's `<` comparisons see. */
const compareCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Unsigned LEB128: most dictionary frequencies are small, so this is ~1.3 bytes a word. */
const encodeVarints = (values) => {
    const bytes = [];
    for (let value of values) {
        while (value >= 0x80) {
            bytes.push((value & 0x7f) | 0x80);
            value = Math.floor(value / 0x80);
        }
        bytes.push(value);
    }
    return Buffer.from(bytes).toString('base64');
};

const buildDictModule = () => {
    const entries = new Map();
    for (const line of readData('dict.txt').split('\n')) {
        const [word, freq] = line.trim().split(' ');
        if (!word) continue;
        // A repeated word (the file has one, B超) keeps its last frequency and counts once towards
        // the total. That is jieba-rs's behaviour, not Python jieba's (which counts every line), and
        // it is observable: the total sets where exact floating-point ties land.
        entries.set(word, Number(freq));
    }
    let total = 0;
    entries.forEach(freq => { total += freq; });
    const words = [...entries.keys()].sort(compareCodeUnits);
    if (words.some(word => word.includes('\n'))) throw new Error('jieba dict: a word contains a newline');
    return [
        `export const DICT_WORDS = ${JSON.stringify(words.join('\n'))};`,
        `export const DICT_FREQS = ${JSON.stringify(encodeVarints(words.map(word => entries.get(word))))};`,
        `export const DICT_TOTAL = ${total};`,
    ].join('\n');
};

/** jieba's finalseg tables are Python dict literals with '\uXXXX' keys, which JSON can read once quoted. */
const readPythonTable = (file) => {
    const source = readData(file);
    return JSON.parse(source.slice(source.indexOf('{')).replace(/'/g, '"'));
};

/** Every character whose simplified form is a different single character, as "tstst..." pairs. */
const buildT2sPairs = () => {
    // 't', not 'tw': the table also runs on simplified text, and the Taiwan preset rewrites two valid
    // simplified characters (么 -> 幺, 著 -> 着), which breaks 为什么 and 著名.
    const convert = OpenCC.Converter({ from: 't', to: 'cn' });
    let pairs = '';
    const ranges = [[0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xf900, 0xfaff]];
    for (const [from, to] of ranges) {
        for (let code = from; code <= to; code += 1) {
            const char = String.fromCharCode(code);
            const simplified = convert(char);
            if (simplified !== char && simplified.length === 1) pairs += char + simplified;
        }
    }
    return pairs;
};

const buildHmmModule = () => {
    const emit = readPythonTable('prob_emit.py');
    // Per state: the characters as one string and their log probabilities as float64, exact, so the
    // Viterbi sums come out bit-for-bit as jieba's.
    const emitPacked = Object.fromEntries(Object.entries(emit).map(([state, table]) => {
        const chars = Object.keys(table);
        const logs = new Float64Array(chars.map(char => table[char]));
        return [state, [chars.join(''), Buffer.from(logs.buffer).toString('base64')]];
    }));
    return [
        `export const HMM_START = ${JSON.stringify(readPythonTable('prob_start.py'))};`,
        `export const HMM_TRANS = ${JSON.stringify(readPythonTable('prob_trans.py'))};`,
        `export const HMM_EMIT = ${JSON.stringify(emitPacked)};`,
        `export const T2S_PAIRS = ${JSON.stringify(buildT2sPairs())};`,
    ].join('\n');
};

export const icuFoliaDataPlugin = () => ({
    name: 'icu-folia-data',
    resolveId(id) {
        return RESOLVED.get(id) ?? null;
    },
    load(id) {
        if (id === RESOLVED.get(DICT_MODULE_ID)) {
            this.addWatchFile(dataPath('dict.txt'));
            return buildDictModule();
        }
        if (id === RESOLVED.get(HMM_MODULE_ID)) {
            ['prob_start.py', 'prob_trans.py', 'prob_emit.py'].forEach(file => this.addWatchFile(dataPath(file)));
            return buildHmmModule();
        }
        return null;
    },
});
