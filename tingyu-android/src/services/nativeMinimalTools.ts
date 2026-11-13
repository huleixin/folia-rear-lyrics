import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { useAudioToolsStore, QUALITY_LABELS } from '../stores/useAudioToolsStore';
import { useSettingsModalStore } from '../stores/useSettingsModalStore';
import { useLxSourceStore } from '../stores/useLxSourceStore';
import { omni } from './onlineMusic/omni';
import { checkLxScript, loadLxScriptUrl } from './lxSource/management';
import { noteLx, redactLx } from './lxSource/diagnostics';
import { pickLxScript } from './lxSource/importFile';
import { isLocalPlaybackSong, resolveNavidromePlaybackCarrier } from '../utils/appPlaybackGuards';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { readLyricFile } from '../utils/lyrics/lyricFileDecoding';
import { pickNativeSettingsFiles } from './nativeSettingsFilePicker';
import { canUseComposeChrome, chromeNative } from './nativeChrome';
import { isAndroidNativeRuntime } from '../utils/platform';
import { AUDIO_SOUND_PRESETS } from '../utils/audioPresets';
import { createNeutralAudioEffects } from '../utils/audioEffects';
import { AUDIO_EQUALIZER_CUSTOM_SLOT_IDS, isAudioEqualizerCustomSlotId, getAudioEqualizerCustomSlotIndex } from '../utils/audioEqualizer';
import type { SongResult } from '../types';

// src/services/nativeMinimalTools.ts
//
// 原生工具页（音质 / 音频效果器 / 歌词工具 / 洛雪音源）的**唯一**数据入口，第 11 轮。
//
// 架构与 `nativeMinimalQueue.ts` 完全同构，包括第 10 轮用血换来的两条教训：
//  · 处理器**只注册一次**（App 传入稳定对象，内部 ref 转发最新面板模型），状态每次现读 store；
//  · 动作监听器 attach 带代次守卫，注册往复多少次都只剩一条活着的监听器。
//
// 状态分页推给原生（minimalTools 快照）；原生动作原样转交既有处理器 ——
// 音质走 useAudioToolsStore 的切换链，效果器走 useAudioSettingsStore 的音效链，
// 歌词走播放面板的同一批 handlers，洛雪走 useLxSourceStore + omni。
// 这里不实现任何业务，只是桥。

/** 工具页代号：与 Kotlin 侧 `openNativeTools(page)` 的编号一致。 */
export type NativeToolPage = 'quality' | 'effects' | 'lyrics' | 'lx';
const PAGE_INDEX: Record<NativeToolPage, number> = { quality: 1, effects: 2, lyrics: 3, lx: 4 };

export type NativeToolsHandlers = {
    /** 音质切换（走 useAudioToolsStore 的请求链，由 useAudioQualitySwitch 真正执行）。 */
    switchQuality: (quality: 'standard' | 'high' | 'lossless' | 'hires') => void;
    /** 歌词工具的处理器，来自播放面板模型（与 WebView 歌词工具同一批函数）。 */
    lyrics: {
        currentSong: SongResult | null;
        onlineLyricsState: { lyricsSource?: string; importedLyrics?: unknown; hasOnlineOverride?: boolean } | null;
        onChangeLyricsSource: (source: 'local' | 'embedded' | 'online') => void;
        onChangeOnlineLyricsSource: (source: 'online' | 'imported') => void;
        onMatchOnline: () => void;
        onMatchOnlineLyrics: () => void;
        onUpdateLocalLyrics: (content: string, translation: boolean, name: string) => Promise<void>;
        onImportOnlineLyrics: (content: string, name: string) => Promise<void>;
        onClearOnlineLyricsState: () => void;
        onLyricTimelineOffsetChange: (offsetMs: number) => void;
        lyricTimelineOffsetMs: number;
    } | null;
};

export type NativeToolsSnapshot = {
    v: number;
    /** 当前打开的工具页（宿主动作 toolsOpen/toolsClose 维护）。 */
    page: '' | NativeToolPage;
    quality: {
        current: string;
        currentLabel: string;
        actual: string;
        switching: boolean;
        error: string;
        local: boolean;
    };
    effects: {
        enabled: boolean;
        preset: string;
        gains: number[];
        effects: Record<string, number>;
    };
    lyrics: {
        title: string;
        artist: string;
        local: boolean;
        navi: boolean;
        sources: { id: string; label: string }[];
        selected: string;
        offsetMs: number;
        busy: boolean;
        message: string;
        hasOnlineOverride: boolean;
        imported: boolean;
    };
    lx: {
        activeName: string;
        scripts: { id: string; name: string; meta: string; active: boolean; caps: { name: string; qualitys: string }[]; hasUpdateUrl: boolean; canRollback: boolean }[];
        selectedId: string;
        policy: { autoDowngrade: boolean; autoSwitch: boolean; retries: number; preferredSource: string };
        qualities: { value: string; label: string }[];
        busy: boolean;
        message: string;
        failed: boolean;
    };
};

let handlers: NativeToolsHandlers | null = null;
let version = 0;
let lastSent = '';
let pageOpen: NativeToolPage | '' = '';
let syncTimer: number | undefined;
let lxMessage = '';
let lxFailed = false;
let lxBusy = false;
let lxSelectedId = '';

export function registerNativeTools(next: NativeToolsHandlers | null): void {
    handlers = next;
    if (!next) {
        pageOpen = '';
        lastSent = '';
        if (syncTimer !== undefined && typeof window !== 'undefined') {
            window.clearInterval(syncTimer);
            syncTimer = undefined;
        }
        void detachToolsActionListener();
        return;
    }
    // 对账循环只在整个会话挂一次；没有工具页打开时是纯内存比较，零字节。
    if (syncTimer === undefined && typeof window !== 'undefined') {
        syncTimer = window.setInterval(() => { syncNativeTools(); }, 1000);
    }
    void attachToolsActionListener();
}

/**
 * WebView 侧入口（舞台菜单、迷你播放器等）：让原生打开工具页。
 * Compose 桥可用时才走；否则调用方回退到原有 WebView 弹窗。
 */
export async function openNativeToolPage(page: NativeToolPage): Promise<boolean> {
    if (!isAndroidNativeRuntime()) return false;
    try {
        if (!(await canUseComposeChrome())) return false;
        await chromeNative.openMinimalTools({ page: PAGE_INDEX[page] });
        return true;
    } catch {
        return false;
    }
}

// ---- 快照 ----

function buildQualitySnapshot() {
    const tools = useAudioToolsStore.getState();
    const settings = useAudioSettingsStore.getState();
    const song = usePlaybackStore.getState().currentSong;
    const local = song ? isLocalPlaybackSong(song) || !!resolveNavidromePlaybackCarrier(song) : false;
    const actual = tools.actual && song && tools.actual.key === getPlaybackSongKey(song)
        ? (tools.actual.verified===false ? `音源请求 ${QUALITY_LABELS[tools.actual.quality]}（实际未验证）` : QUALITY_LABELS[tools.actual.quality] ?? tools.actual.quality)
        : local ? '原文件' : '未确认（可能来自缓存）';
    return {
        current: settings.audioQuality,
        currentLabel: QUALITY_LABELS[settings.audioQuality] ?? settings.audioQuality,
        actual,
        switching: tools.switching,
        error: tools.error,
        local,
    };
}

const EFFECT_KEYS = ['highpass', 'lowpass', 'drive', 'crush', 'wow', 'noise', 'width', 'space', 'punch'] as const;

function buildEffectsSnapshot() {
    const eq = useAudioSettingsStore.getState().audioEqualizerSettings;
    const effects: Record<string, number> = {};
    for (const key of EFFECT_KEYS) effects[key] = eq.effects[key] ?? 0;
    return { enabled: eq.enabled, preset: eq.preset, gains: [...eq.gains], effects };
}

/** 歌词来源选项：与 useMobileLyrics 的推导保持一致（读 store + 面板处理器给的在线状态）。 */
function buildLyricsSnapshot(): NativeToolsSnapshot['lyrics'] {
    const h = handlers?.lyrics;
    const song = usePlaybackStore.getState().currentSong;
    const local = song ? isLocalPlaybackSong(song) : false;
    const navi = song ? resolveNavidromePlaybackCarrier(song) : null;
    let sources: { id: string; label: string }[] = [];
    let selected = '';
    if (h) {
        if (local) {
            // 本地曲的来源列表需要本地曲库详情（hasLocalLyrics 等），面板模型没带给模块；
            // 原生页显示保守集合，选择动作仍走权威处理器（不认识的来源会被忽略）。
            sources = [{ id: 'local', label: '本地歌词' }, { id: 'embedded', label: '内嵌歌词' }, { id: 'online', label: '平台歌词' }];
            selected = h.onlineLyricsState?.lyricsSource || 'local';
        } else if (navi) {
            sources = [navi.lyricsSource === 'online' ? { id: 'online', label: '平台歌词' } : { id: 'embedded', label: '服务器歌词' }];
            selected = navi.lyricsSource === 'online' ? 'online' : 'embedded';
        } else {
            sources = [{ id: 'online', label: '平台歌词' }];
            if (h.onlineLyricsState?.importedLyrics) sources.push({ id: 'imported', label: '导入歌词' });
            selected = h.onlineLyricsState?.lyricsSource || 'online';
        }
    }
    return {
        title: song?.name ?? '',
        artist: song ? String((song as { artists?: { name?: string }[] }).artists?.[0]?.name ?? (song as { artist?: string }).artist ?? '') : '',
        local,
        navi: !!navi,
        sources,
        selected,
        offsetMs: h?.lyricTimelineOffsetMs ?? 0,
        busy: false,
        message: lyricsMessage,
        hasOnlineOverride: !!h?.onlineLyricsState?.hasOnlineOverride,
        imported: !!h?.onlineLyricsState?.importedLyrics,
    };
}

function buildLxSnapshot(): NativeToolsSnapshot['lx'] {
    const state = useLxSourceStore.getState();
    const active = state.scripts.find(script => script.id === state.activeId);
    return {
        activeName: active?.name || '平台原音源',
        scripts: state.scripts.map(script => ({
            id: script.id,
            name: script.name,
            meta: [script.version, script.author].filter(Boolean).join(' · '),
            active: script.id === state.activeId,
            caps: Object.values(script.capabilities ?? {}).map(cap => ({
                name: cap.name,
                qualitys: cap.qualitys.join(' / '),
            })),
            hasUpdateUrl: Boolean(script.importUrl),
            canRollback: Boolean(script.previous),
        })),
        selectedId: state.scripts.some(script => script.id === lxSelectedId) ? lxSelectedId : (state.activeId || state.scripts[0]?.id || ''),
        policy: { autoDowngrade: state.policy.autoDowngrade, autoSwitch: state.policy.autoSwitch, retries: state.policy.retries, preferredSource: state.policy.preferredSource || '' },
        qualities: [
            { value: 'standard', label: '标准 128k' }, { value: 'high', label: '高品质 320k' },
            { value: 'lossless', label: '无损 FLAC' }, { value: 'hires', label: 'Hi-Res FLAC 24bit' },
        ],
        busy: lxBusy,
        message: lxMessage,
        failed: lxFailed,
    };
}

function buildSnapshot(): NativeToolsSnapshot {
    return {
        v: version,
        page: pageOpen,
        quality: buildQualitySnapshot(),
        effects: buildEffectsSnapshot(),
        lyrics: buildLyricsSnapshot(),
        lx: buildLxSnapshot(),
    };
}

/** 对账：只在工具页打开时推，序列化后与上次比较 —— 没变就零字节。 */
export function syncNativeTools(): void {
    if (!handlers || !pageOpen) return;
    let snapshot: NativeToolsSnapshot;
    try {
        snapshot = buildSnapshot();
    } catch {
        return; // store 正在过渡（切歌等）：下一秒再对。
    }
    let encoded: string;
    try {
        encoded = JSON.stringify(snapshot);
    } catch {
        return;
    }
    if (encoded === lastSent) return;
    lastSent = encoded;
    try {
        void chromeNative.minimalTools(snapshot).catch(() => { lastSent = ''; });
    } catch {
        lastSent = '';
    }
}

// ---- 动作监听（代次守卫，R10 教训）----

type ToolsActionEvent = { id: string; action: string; value: number; text?: string };
let toolsActionListener: { remove: () => Promise<void> } | null = null;
let listenerGeneration = 0;

function onToolsActionEvent(event: ToolsActionEvent): void {
    if (event.id !== 'minimal') return;
    runNativeToolsAction(event.action, typeof event.value === 'number' ? event.value : 0, typeof event.text === 'string' ? event.text : '');
}

async function attachToolsActionListener(): Promise<void> {
    if (toolsActionListener) return;
    const generation = ++listenerGeneration;
    try {
        const listener = await chromeNative.addListener('action', onToolsActionEvent);
        if (generation !== listenerGeneration) {
            try { await listener.remove(); } catch { /* 桥已不在。 */ }
            return;
        }
        toolsActionListener = listener;
    } catch {
        // 桥不在（非 Android 环境）就没有动作可接。
    }
}
async function detachToolsActionListener(): Promise<void> {
    listenerGeneration += 1;
    const listener = toolsActionListener;
    toolsActionListener = null;
    try { await listener?.remove(); } catch { /* 已断开就算了。 */ }
}

// ---- 歌词导入（SAF → 既有处理器）----

const LYRICS_ACCEPT = '.lrc,.ttml,.qrc,.krc,.yrc,.lys,.srt,.vtt,.txt,.fia,.json';

async function importLyricsFile(translation: boolean): Promise<void> {
    const h = handlers?.lyrics;
    if (!h) return;
    lyricsMessage = '正在读取歌词文件…'; lxFailed = false;
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = LYRICS_ACCEPT;
        const files = await pickNativeSettingsFiles(input);
        if (!files || !files.length) { lyricsMessage = '已取消选择'; return; }
        const file = files[0];
        const content = await readLyricFile(file);
        if (!content.trim()) throw new Error('empty');
        if (usePlaybackStore.getState().currentSong && isLocalPlaybackSong(usePlaybackStore.getState().currentSong!)) {
            await h.onUpdateLocalLyrics(content, translation, file.name);
        } else {
            await h.onImportOnlineLyrics(content, file.name);
        }
        lyricsMessage = '歌词已导入';
    } catch (error) {
        lyricsMessage = error instanceof Error && error.message === 'empty' ? '文件里没有歌词' : '导入失败，换一个文件试试';
        lxFailed = true;
    }
    lastSent = '';
    syncNativeTools();
}

// ---- 洛雪音源（与 LxSourceDialog 同一条链）----

async function importLxScript(): Promise<void> {
    lxBusy = true; lxMessage = '正在检查音源…'; lxFailed = false;
    lastSent = '';
    syncNativeTools();
    try {
        const script = await pickLxScript();
        if (!script) { lxMessage = '已取消选择'; return; }
        const {capabilities} = await checkLxScript(script);
        const id = useLxSourceStore.getState().save({ ...script, capabilities });
        omni.activateLxSource(id);
        lxMessage = `初始化成功：${Object.values(capabilities).map(c => `${c.name} (${c.qualitys.join(' / ')})`).join('、')}`;
    } catch (error) {
        lxFailed = true;
        lxMessage = redactLx(error);noteLx('import','import',error);
    } finally {
        lxBusy = false;
        lastSent = '';
        syncNativeTools();
    }
}

async function testLxScript(id: string): Promise<void> {
    const script = useLxSourceStore.getState().scripts.find(item => item.id === id);
    if (!script) return;
    lxBusy = true; lxMessage = '正在检查音源…'; lxFailed = false;
    lastSent = '';
    syncNativeTools();
    try {
        const {capabilities} = await checkLxScript(script);
        useLxSourceStore.getState().save({ ...script, capabilities });
        lxMessage = `初始化成功：${Object.values(capabilities).map(c => `${c.name} (${c.qualitys.join(' / ')})`).join('、')}。实际取流请播放对应平台的歌曲验证。`;
    } catch (error) {
        lxFailed = true;
        lxMessage = redactLx(error);noteLx('import','import',error);
    } finally {
        lxBusy = false;
        lastSent = '';
        syncNativeTools();
    }
}

/**
 * 原生发来的工具动作。编码约定：
 *  · effectsBand：value = band*100 + (gainDb + 12)（增益整数 dB，-12..12）
 *  · effectsParam：value = paramIndex*10000 + 归一化位置(0..1000)
 *  · effectsPreset：value = 预设下标（flat lofi radio hall vocal bass custom1 custom2）
 *  · lyricsSource：value = 来源下标；lyricsOffset：value = 毫秒（可负）
 */
export function runNativeToolsAction(action: string, value: number, text = ''): boolean {
    if (!handlers) return false;
    switch (action) {
        case 'toolsOpen': {
            pageOpen = ({ 1: 'quality', 2: 'effects', 3: 'lyrics', 4: 'lx' } as Record<number, NativeToolPage>)[value] ?? '';
            if (!pageOpen) return true;
            lastSent = '';
            syncNativeTools();
            return true;
        }
        case 'toolsClose': {
            pageOpen = '';
            lastSent = '';
            return true;
        }
        case 'qualityPick': {
            const qualities = ['standard', 'high', 'lossless', 'hires'] as const;
            const quality = qualities[value];
            if (!quality) return false;
            handlers.switchQuality(quality);
            lastSent = '';
            syncNativeTools();
            return true;
        }
        case 'effectsToggle': {
            const store = useAudioSettingsStore.getState();
            const eq = store.audioEqualizerSettings;
            store.handleSetAudioEqualizerSettings({ ...eq, enabled: !eq.enabled });
            lastSent = '';
            syncNativeTools();
            return true;
        }
        case 'effectsPreset': {
            const preset = AUDIO_EQUALIZER_CUSTOM_SLOT_IDS.concat([]) as unknown as string[];
            const ids = ['flat', 'lofi', 'radio', 'hall', 'vocal', 'bass', ...preset];
            const presetId = ids[value];
            const store = useAudioSettingsStore.getState();
            const eq = store.audioEqualizerSettings;
            if (!presetId || presetId === eq.preset) return true;
            // 与 AudioEqualizerDialog.applyPreset 同构：预设/自定义槽的增益与效果一起换，并强制开启。
            const source = isAudioEqualizerCustomSlotId(presetId)
                ? eq.customSlots[getAudioEqualizerCustomSlotIndex(presetId)]
                : AUDIO_SOUND_PRESETS[presetId as keyof typeof AUDIO_SOUND_PRESETS];
            if (!source) return false;
            store.handleSetAudioEqualizerSettings({
                ...eq,
                enabled: true,
                preset: presetId as never,
                gains: [...source.gains],
                effects: { ...source.effects },
            });
            lastSent = '';
            syncNativeTools();
            return true;
        }
        case 'effectsResetCustom': {
            // 与 AudioEqualizerDialog.resetActiveCustomSlot 同构：只清当前自定义槽。
            const store = useAudioSettingsStore.getState();
            const eq = store.audioEqualizerSettings;
            if (!isAudioEqualizerCustomSlotId(eq.preset)) return true;
            const slotIndex = getAudioEqualizerCustomSlotIndex(eq.preset);
            const gains = [...AUDIO_SOUND_PRESETS.flat.gains];
            const effects = createNeutralAudioEffects();
            store.handleSetAudioEqualizerSettings({
                ...eq,
                gains,
                effects: { ...effects },
                customSlots: eq.customSlots.map((slot, index) => (
                    index === slotIndex ? { gains: [...gains], effects: { ...effects } } : slot
                )),
            });
            lastSent = '';
            syncNativeTools();
            return true;
        }
        case 'effectsBand': {
            const band = Math.floor(value / 100);
            const gain = (value % 100) - 12;
            if (band < 0 || band > 9) return false;
            const store = useAudioSettingsStore.getState();
            const eq = store.audioEqualizerSettings;
            if (eq.gains[band] === gain) return true;
            const gains = [...eq.gains];
            gains[band] = gain;
            // 滑动中写入 store（实时可听）；持久化交给 handleSetAudioEqualizerSettings 的既有语义。
            store.handleSetAudioEqualizerSettings({ ...eq, gains, preset: eq.preset.startsWith('custom') ? eq.preset : 'custom1' });
            lastSent = '';
            return true; // 拖动中不每次都全量对账，松手后由定时对账收敛。
        }
        case 'effectsParam': {
            const index = Math.floor(value / 10000);
            const norm = (value % 10000) / 1000; // 0..1
            const store = useAudioSettingsStore.getState();
            const eq = store.audioEqualizerSettings;
            const key = EFFECT_KEYS[index];
            if (!key) return false;
            const next = { ...eq.effects };
            if (key === 'highpass') next.highpass = Math.round(20 * Math.pow(2000 / 20, norm));
            else if (key === 'lowpass') next.lowpass = Math.round(500 * Math.pow(20000 / 500, norm));
            else if (key === 'width') next.width = Math.round(norm * 200) / 100;
            else next[key] = Math.round(norm * 100) / 100;
            store.handleSetAudioEqualizerSettings({ ...eq, effects: next, preset: eq.preset.startsWith('custom') ? eq.preset : 'custom1' });
            lastSent = '';
            return true;
        }
        case 'lyricsSource': {
            const h = handlers.lyrics;
            if (!h) return false;
            const snapshot = buildLyricsSnapshot();
            const source = snapshot.sources[value];
            if (!source) return false;
            if (snapshot.local) h.onChangeLyricsSource(source.id as 'local' | 'embedded' | 'online');
            else if (!snapshot.navi) h.onChangeOnlineLyricsSource(source.id as 'online' | 'imported');
            lastSent = '';
            syncNativeTools();
            return true;
        }
        case 'lyricsMatch': {
            const h = handlers.lyrics;
            if (!h) return false;
            if (h.currentSong && (isLocalPlaybackSong(h.currentSong) || resolveNavidromePlaybackCarrier(h.currentSong))) h.onMatchOnline();
            else h.onMatchOnlineLyrics();
            lastSent = '';
            syncNativeTools();
            return true;
        }
        case 'lyricsImport': {
            void importLyricsFile(value === 1);
            return true;
        }
        case 'lyricsOffset': {
            const h = handlers.lyrics;
            if (!h) return false;
            const ms = Math.max(-60000, Math.min(60000, Math.round(value)));
            h.onLyricTimelineOffsetChange(ms);
            lastSent = '';
            return true;
        }
        case 'lyricsClearOnline': {
            handlers.lyrics?.onClearOnlineLyricsState();
            lastSent = '';
            syncNativeTools();
            return true;
        }
        case 'lxManage': {
            useSettingsModalStore.getState().openSettingsFromIndex('integration');
            useLxSourceStore.getState().show();
            return true;
        }
        case 'lxSelect': {
            const script=useLxSourceStore.getState().scripts[value];if(!script)return false;lxSelectedId=script.id;lastSent='';syncNativeTools();return true;
        }
        case 'lxToggleDowngrade': {
            const state=useLxSourceStore.getState();state.setPolicy({autoDowngrade:!state.policy.autoDowngrade});lastSent='';syncNativeTools();return true;
        }
        case 'lxToggleSwitch': {
            const state=useLxSourceStore.getState();state.setPolicy({autoSwitch:!state.policy.autoSwitch});lastSent='';syncNativeTools();return true;
        }
        case 'lxUpdateUrl': {
            const state=useLxSourceStore.getState(),script=state.scripts.find(item=>item.id===lxSelectedId);
            if(!script)return false;
            lxBusy=true;lastSent='';syncNativeTools();
            void (async()=>{try{state.setImportUrl(script.id,text);lxMessage=text?'更新地址已绑定':'更新地址已清除';lxFailed=false;}catch(error){lxFailed=true;lxMessage=redactLx(error);}finally{lxBusy=false;lastSent='';syncNativeTools();}})();
            return true;
        }
        case 'lxCheckUpdate': {
            const state=useLxSourceStore.getState(),script=state.scripts.find(item=>item.id===lxSelectedId);
            if(!script?.importUrl)return false;
            lxBusy=true;lxMessage='正在检查更新…';lxFailed=false;lastSent='';syncNativeTools();
            void (async()=>{try{const next=await loadLxScriptUrl(script.importUrl!);if(next.name!==script.name)throw Error('更新脚本名称与原音源不一致');
                if(next.code===script.code){lxMessage='已是最新版本';return;}
                const {capabilities}=await checkLxScript(next);const id=state.save({...next,id:script.id,capabilities});if(state.activeId===script.id)omni.activateLxSource(id);
                lxMessage=`已更新到 ${next.version||'新版本'}，可回退上一版`;
            }catch(error){lxFailed=true;lxMessage=redactLx(error);noteLx('update-check','import',error);}finally{lxBusy=false;lastSent='';syncNativeTools();}})();
            return true;
        }
        case 'lxRollback': {
            const state=useLxSourceStore.getState(),script=state.scripts.find(item=>item.id===lxSelectedId);if(!script?.previous)return false;
            try{state.rollback(script.id);lxMessage='已回退上一版';lxFailed=false;}catch(error){lxMessage=redactLx(error);lxFailed=true;}
            lastSent='';syncNativeTools();return true;
        }
        case 'lxImport': {
            void importLxScript();
            return true;
        }
        case 'lxTest': {
            const script = useLxSourceStore.getState().scripts[value];
            if (script) void testLxScript(script.id);
            return true;
        }
        case 'lxActivate': {
            const script = useLxSourceStore.getState().scripts[value];
            if (!script) return false;
            omni.activateLxSource(script.id);
            lastSent = '';
            syncNativeTools();
            return true;
        }
        case 'lxRestore': {
            omni.activateLxSource(null);
            lastSent = '';
            syncNativeTools();
            return true;
        }
        case 'lxRemove': {
            const state = useLxSourceStore.getState();
            const script = state.scripts[value];
            if (!script) return false;
            if (state.activeId === script.id) omni.activateLxSource(null);
            state.remove(script.id);
            lastSent = '';
            syncNativeTools();
            return true;
        }
        default:
            return false;
    }
}

/** 歌词工具的状态消息（导入结果等）。原生侧随下一包快照看到。 */
export let lyricsMessage = '';
export function setLyricsMessage(message: string): void {
    lyricsMessage = message;
    lastSent = '';
}
