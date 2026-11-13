import { chromeNative } from './nativeChrome';

// src/services/nativeMinimalPlayer.ts
// The Compose minimal player's half of the bridge.
//
// What crosses this bridge is deliberately small: play mode, neighbour availability, and a
// position anchor for the browser-audio channel. Song identity, duration, lyrics and the Media3
// clock are read natively — sending them here as well would create a second answer to
// "which line is this song on", which is exactly the class of bug this migration must not add.
//
// One session per mounted bridge. Native echoes it back on every action, so a command queued
// against a page that has since changed songs can be dropped instead of seeking the wrong track.

export type MinimalPlayerFrame = {
    session: string;
    trackKey: string;
    title: string;
    artist: string;
    album: string;
    cover: string;
    playing: boolean;
    position: number;
    duration: number;
    canPrevious: boolean;
    canNext: boolean;
    disabled: boolean;
    preparing: boolean;
    mode: 'off' | 'all' | 'one' | 'shuffle';
    /** Ready-to-render quality caption ("FLAC · 无损"), already translated on this side. */
    quality: string;
    /** The chip's gold tone, decided by `resolveQualityBadges`, not by the caption text. */
    qualityGold: boolean;
    /**
     * 全局音质标签的层级（standard/hq/flac/hires/master/spatial），来自
     * `resolvePlayingQualityLevel` —— 只描述**正在出声的这份字节**；空串表示没有可靠信息，
     * 原生回退旧的 plain/gold chip。
     */
    qualityLevel: string;
    /** 无损标签的真实格式文案（APE/WAV/DSD/ALAC 不冒充 FLAC）；FLAC 为空。 */
    qualityLabelOverride: string;
    catalogVersions: string;
    /** 播放偏好里的音质档位（"无损"/"高品质"…），只给"更多"菜单用，和上面的容器角标不是一回事。 */
    qualityMode: string;
    /** 音效开关状态，同样是菜单里的第二行值。 */
    effectsOn: boolean;
    /**
     * 这一页现在的主题（`isDaylight`）—— **和 palette 同一个来源**。
     *
     * 原生的 `InterfaceAppearance` 是"应用界面"的深浅色，和播放器主题不是一回事：
     * 两者不一致时，页面会拿到深色配色 + 浅色墨色，也就是深蓝底上的深绿字。
     */
    light: boolean;
    liked: boolean;
    likeDisabled: boolean;
    /**
     * True while the listener is looking at the full lyric stage. The native page is a full-window
     * layer, so it must step aside instead of covering a stage that still lives in the WebView.
     */
    detour: boolean;
    stageMotionToken?: number;
    stageMotionDetour?: boolean;
    /**
     * 渲染来源诊断角标（临时，真机验收后删）。true 时原生在极简页上画一个 "Compose" 角标，
     * WebView 极简页画 "WebView" —— 来源是显式声明，不靠外观判断。
     */
    diag: boolean;
    /**
     * The six colours the minimal page paints with, straight from `buildMinimalPalette` — the same
     * call the WebView page makes. Native does not re-derive them: a ported palette drifts from the
     * original by a hue or two, and "close enough" is exactly what this pass is fixing.
     */
    palette: [string, string, string, string, string, string] | null;
};

export type MinimalPlayerAction = {
    id: string;
    session: string;
    action: string;
    value: number;
};

/** The surface id the Compose page uses on the shared action bus. */
export const MINIMAL_PLAYER_ACTION_ID = 'minimal';

let session = '';

export const minimalPlayerSession = (): string => session;

/**
 * Compose 是否正持有极简播放页的显示权（最近一次握手结果）。
 *
 * 第 12 轮：路由发布要用它。以前 `canPublishNativeStage` 只认 WebView 上的
 * `[data-player-surface-ready]` —— 一旦 Compose 接管、WebView 极简页卸载，这个属性就没了，
 * 之后所有发往 `stage` 的路由更新都会被这道门静默丢弃：从设置页返回时外壳永远停在设置页。
 * 模块级镜像让路由层不必订阅 React 状态也能读到同一个事实。
 */
let composeOwnsSurface = false;

export const setComposeMinimalOwnership = (owns: boolean): void => {
    composeOwnsSurface = owns;
};

export const composeMinimalOwnsSurface = (): boolean => composeOwnsSurface;

/**
 * 桥帧被拒之后怎么处置显示权。纯函数，单测直接覆盖（第 12 轮）。
 *
 * - `hold`：拒绝是预期（顺访舞台 / 设置页原生接管），所有权保持，等待回来；
 * - `handback`：WebView 弹层要显示，立即交回；
 * - `fail`：真异常，计入三次回退预算。
 */
export type MinimalRejectionOutcome = 'hold' | 'handback' | 'fail';

export const resolveMinimalRejection = (
    stageDetour: boolean,
    settingsOpen: boolean,
    webOverlayOpen: boolean,
): MinimalRejectionOutcome => {
    if (stageDetour || settingsOpen) return 'hold';
    if (webOverlayOpen) return 'handback';
    return 'fail';
};

/**
 * Start a new bridge session. Called once per mount; the previous session immediately stops being
 * accepted by native (`session` no longer matches), so late frames cannot revive a dead page.
 */
export const beginMinimalPlayerSession = (): string => {
    session = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `minimal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return session;
};

/**
 * Publish one frame. Resolves to whether the host accepted it — the caller uses that as the
 * hand-off signal: the WebView minimal page is only unmounted after native confirms it has a frame.
 */
export const publishMinimalPlayerFrame = async (frame: MinimalPlayerFrame): Promise<boolean> => {
    if (!session || frame.session !== session) {
        return false;
    }
    try {
        const result = await chromeNative.minimalPlayerFrame(frame) as { accepted?: boolean } | undefined;
        return result?.accepted !== false && result !== undefined;
    } catch {
        return false;
    }
};

/**
 * Subscribe to actions from the Compose page. Every other surface filters by its own id, so a
 * listener here can never receive a tap meant for the stage bar or the mini player.
 */
export const addMinimalPlayerActionListener = (
    sessionAtMount: string,
    listener: (action: string, value: number) => void,
): Promise<{ remove: () => Promise<void> } | undefined> => {
    return chromeNative.addListener('action', event => {
        if (event.id !== MINIMAL_PLAYER_ACTION_ID) return;
        if (event.session !== sessionAtMount) return;
        listener(event.action, typeof event.value === 'number' ? event.value : 0);
    });
};

/**
 * Hand the surface back. Called when the WebView has to paint something the native page would
 * cover (the queue sheet still lives in React in phase 1). Native stops drawing immediately and the
 * WebView minimal page takes over again.
 *
 * Session-scoped: a release that arrives late cannot tear down a newer session's page.
 */
export const releaseMinimalPlayerSurface = async (sessionAtMount: string): Promise<void> => {
    if (!sessionAtMount) return;
    try {
        await chromeNative.minimalPlayerRelease({ session: sessionAtMount });
    } catch {
        // The next page's frames re-establish the surface anyway.
    }
};

/** Everything a Compose action can reach. Built fresh per action so it reads current state. */
export type MinimalActionHandlers = {
    /** The song the Compose page is currently showing. */
    displayedTrackKey: string;
    /** The song the last acknowledged frame described. */
    publishedTrackKey: string;
    playing: boolean;
    togglePlay: () => void;
    previous: () => void;
    next: () => void;
    seek: (seconds: number) => void;
    toggleLoop: () => void;
    collapse: () => void;
    /** 顶栏"更多"菜单的五项，和 `MobileStageMenu` 一一对应。 */
    openAudioQuality: () => void;
    openAudioEffects: () => void;
    openLyricsPanel: () => void;
    openPlaybackSettings: () => void;
    like: () => void;
    /** 顺访完整歌词舞台。舞台仍是 WebView，原生页交还界面。 */
    openStage: () => void;
};

/**
 * One place that turns a Compose action into an existing app command.
 *
 * 范围说明（第 9 轮）：这里只管**传输与菜单**。队列动作（queuePlay/queueRemove/queueReorder/
 * playbackMode 等）由 `nativeMinimalQueue.ts` 的模块级监听者处理 —— 抽屉在首页/舞台打开时
 * 极简页钩子不在场，队列动作必须不依赖它；两边动作集互不重叠，不会双重执行。
 *
 * Two rules are worth stating, because they are the difference between "works" and "seeks the
 * previous song":
 *  · `play`/`pause` never toggle blindly — the page may be a second stale and the transport must not
 *    invert the opposite of what the listener sees;
 *  · `seek` is dropped when the page's song and the frame's song disagree. A position is only
 *    meaningful for the track it was measured in.
 *
 * Returns whether the action was accepted, so the caller can log or ignore it.
 */
export function dispatchMinimalAction(action: string, value: number, handlers: MinimalActionHandlers): boolean {
    switch (action) {
        case 'toggle':
            handlers.togglePlay();
            return true;
        case 'play':
            if (!handlers.playing) handlers.togglePlay();
            return true;
        case 'pause':
            if (handlers.playing) handlers.togglePlay();
            return true;
        case 'previous':
            handlers.previous();
            return true;
        case 'next':
            handlers.next();
            return true;
        case 'seek':
            if (handlers.displayedTrackKey !== handlers.publishedTrackKey) return false;
            if (!Number.isFinite(value)) return false;
            handlers.seek(Math.max(0, value));
            return true;
        case 'loop':
            handlers.toggleLoop();
            return true;
        case 'collapse':
            handlers.collapse();
            return true;
        case 'audioQuality':
            handlers.openAudioQuality();
            return true;
        case 'audioEffects':
            handlers.openAudioEffects();
            return true;
        case 'lyricsPanel':
            handlers.openLyricsPanel();
            return true;
        case 'playbackSettings':
            handlers.openPlaybackSettings();
            return true;
        case 'like':
            handlers.like();
            return true;
        case 'openStage':
            handlers.openStage();
            return true;
        default:
            return false;
    }
}
