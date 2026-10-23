import type { ModRuntimeInfo } from '../types';
import { homeTabsRegistry, selectFoliumHomeTab } from './registries/homeTabs';
import { invokeModNetFetch, invokeModPickFile, invokeModReleaseFile, invokeModRestoreFile } from '../ipc';
import type {
    FoliumContextKind,
    FoliumDisposer,
    FoliumFetchInit,
    FoliumFetchResponse,
    FoliumFileHandle,
    FoliumIconOptions,
    FoliumLoopMode,
    FoliumNetService,
    FoliumPlaybackService,
    FoliumQueueSnapshot,
    FoliumSong,
    FoliumUiService,
} from './contract';

// src/mods/folium/services.ts
// `folium.playback`, `folium.ui` and `folium.net`. This module deliberately
// imports no app stores (nothing under src/stores): the export window loads it
// too. The one store it does bring in is mods-owned — the home-page selection in
// registries/homeTabs (pinned by foliumServicesBoundary.test.ts). The main window's App
// registers the real actions (registerFoliumHostActions, see hostActions.ts);
// until it has — and always in the export window — calls fail with a clear
// "unavailable" error instead of touching state that does not exist there.

export interface FoliumHostActions {
    getPlaybackState: () => ReturnType<FoliumPlaybackService['getState']>;
    play: () => void;
    pause: () => void;
    toggle: () => void;
    seek: (seconds: number) => void;
    /** The builtin lyric-line seek: lyric time in, converted to playback time by the host. */
    seekToLyricTime: (lyricSeconds: number) => void;
    next: () => void;
    previous: () => void;
    /** Resolves a song ref and plays it; false when the ref is unknown. */
    playSongRef: (ref: string) => Promise<boolean>;
    enqueueSongRef: (ref: string) => boolean;
    /** False when the queue cannot be shuffled right now. */
    shuffleQueue: () => boolean;
    /** False when the displayed song cannot be liked right now. */
    toggleLike: () => boolean;
    getVolume: () => { volume: number; muted: boolean };
    /** Already clamped to 0–1 by the service. */
    setVolume: (volume: number) => void;
    setMuted: (muted: boolean) => void;
    getLoopMode: () => FoliumLoopMode;
    setLoopMode: (mode: FoliumLoopMode) => void;
    /** `offset` is a whole number or undefined (centre on the displayed song); `limit` is 1–500. */
    getQueue: (offset: number | undefined, limit: number) => FoliumQueueSnapshot;
    /** False when the entry cannot be played: out of range, Stage playback, or no longer `expectedRef`. */
    playQueueItem: (index: number, expectedRef: string | undefined) => Promise<boolean>;
    toast: (message: string, type: 'info' | 'success' | 'error', durationMs?: number) => void;
    openPlayerPanel: (tab: string | null) => void;
    navigate: (view: 'home' | 'player') => void;
    openVolume: () => void;
}

let hostActions: FoliumHostActions | null = null;

export const registerFoliumHostActions = (actions: FoliumHostActions | null) => {
    hostActions = actions;
};

const PLAYBACK_CONTROL = 'playback.control';
const NET_EMBED = 'net.embed';

const requireActions = (what: string, context: FoliumContextKind): FoliumHostActions => {
    if (context !== 'main' || !hostActions) {
        throw new Error(`${what}-unavailable-in-${context}-context`);
    }
    return hostActions;
};

const requirePermission = (mod: ModRuntimeInfo, permission: string) => {
    if (!mod.permissions.includes(permission)) {
        throw new Error(`permission-denied:${permission}`);
    }
};

const requireRef = (song: FoliumSong): string => {
    if (!song || typeof song.ref !== 'string') {
        throw new Error('song-ref-required: pass a song DTO that came from the host');
    }
    return song.ref;
};

const LOOP_MODES: readonly FoliumLoopMode[] = ['off', 'all', 'one'];
// The most queue entries one getQueue call returns, and its default page size.
const MAX_QUEUE_PAGE = 500;

/*
 * getQueue's options, checked: a value that is given must be a finite number
 * (anything else throws rather than silently reading another page). Both are
 * floored; the limit is clamped to 1–500 here, the offset to the queue length
 * by the host, which is the side that knows the length.
 */
const resolveQueuePage = (options: { offset?: number; limit?: number } | undefined) => {
    const { offset, limit } = options ?? {};
    if (offset !== undefined && !Number.isFinite(offset)) {
        throw new Error('playback.getQueue: offset must be a finite number');
    }
    if (limit !== undefined && !Number.isFinite(limit)) {
        throw new Error('playback.getQueue: limit must be a finite number');
    }
    return {
        offset: offset === undefined ? undefined : Math.floor(offset),
        limit: limit === undefined ? MAX_QUEUE_PAGE : Math.min(MAX_QUEUE_PAGE, Math.max(1, Math.floor(limit))),
    };
};

export const createFoliumPlaybackService = (mod: ModRuntimeInfo, context: FoliumContextKind): FoliumPlaybackService => {
    const control = () => {
        requirePermission(mod, PLAYBACK_CONTROL);
        return requireActions('playback', context);
    };
    return Object.freeze({
        getState: () => requireActions('playback', context).getPlaybackState(),
        play: () => control().play(),
        pause: () => control().pause(),
        toggle: () => control().toggle(),
        seek: (seconds: number) => {
            if (!Number.isFinite(seconds)) throw new Error('playback.seek requires a finite number of seconds');
            control().seek(Math.max(0, seconds));
        },
        seekToLyricTime: (lyricSeconds: number) => {
            if (!Number.isFinite(lyricSeconds)) throw new Error('playback.seekToLyricTime requires a finite number of seconds');
            control().seekToLyricTime(lyricSeconds);
        },
        next: () => control().next(),
        previous: () => control().previous(),
        playSong: async (song: FoliumSong) => control().playSongRef(requireRef(song)),
        enqueue: (song: FoliumSong) => control().enqueueSongRef(requireRef(song)),
        shuffleQueue: () => control().shuffleQueue(),
        toggleLike: () => control().toggleLike(),
        getVolume: () => requireActions('playback', context).getVolume(),
        setVolume: (volume: number) => {
            if (!Number.isFinite(volume)) throw new Error('playback.setVolume requires a finite number');
            control().setVolume(Math.min(1, Math.max(0, volume)));
        },
        setMuted: (muted: boolean) => {
            if (typeof muted !== 'boolean') throw new Error('playback.setMuted requires a boolean');
            control().setMuted(muted);
        },
        getLoopMode: () => requireActions('playback', context).getLoopMode(),
        setLoopMode: (mode: FoliumLoopMode) => {
            if (!LOOP_MODES.includes(mode)) throw new Error(`playback.setLoopMode: unknown mode "${String(mode)}"`);
            control().setLoopMode(mode);
        },
        getQueue: (options?: { offset?: number; limit?: number }) => {
            const page = resolveQueuePage(options);
            return requireActions('playback', context).getQueue(page.offset, page.limit);
        },
        playQueueItem: async (index: number, expectedRef?: string) => {
            if (!Number.isInteger(index)) throw new Error('playback.playQueueItem requires an integer index');
            return control().playQueueItem(index, expectedRef);
        },
    });
};

/*
 * The embed iframe. Sandbox keeps the page away from the host document (no
 * same-origin with Folia, no top navigation, no popups escaping); the origin
 * check against the manifest runs here, at the only place mods can create one
 * through the API.
 */
const DEFAULT_EMBED_ALLOW = ['autoplay', 'encrypted-media', 'picture-in-picture', 'fullscreen'];

const createEmbed = (
    mod: ModRuntimeInfo,
    container: HTMLElement,
    url: string,
    options: { title?: string; allow?: string[] } = {},
): FoliumDisposer => {
    requirePermission(mod, NET_EMBED);
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`embed-invalid-url:${url}`);
    }
    if (parsed.protocol !== 'https:' || !(mod.embedOrigins ?? []).includes(parsed.origin)) {
        throw new Error(`embed-origin-not-declared:${parsed.origin} (add it to "embedOrigins" in mod.json)`);
    }
    if (!(container instanceof HTMLElement)) {
        throw new Error('embed requires a container element');
    }
    const frame = document.createElement('iframe');
    frame.src = parsed.toString();
    frame.title = options.title ?? parsed.hostname;
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-forms');
    frame.setAttribute('allow', (options.allow ?? DEFAULT_EMBED_ALLOW).join('; '));
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    frame.style.cssText = 'border:0;width:100%;height:100%;display:block;';
    container.appendChild(frame);
    return () => frame.remove();
};

export const createFoliumUiService = (mod: ModRuntimeInfo, context: FoliumContextKind): FoliumUiService => Object.freeze({
    toast: (message: string, options: { type?: 'info' | 'success' | 'error'; durationMs?: number } = {}) => {
        requireActions('ui', context).toast(String(message), options.type ?? 'info', options.durationMs);
    },
    openPlayerPanel: (tabId?: string) => {
        requireActions('ui', context).openPlayerPanel(tabId ? `folium:${mod.id}:${tabId}` : null);
    },
    openHomeTab: (tabId: string) => {
        const actions = requireActions('ui', context);
        const id = `${mod.id}:${tabId}` as const;
        if (!homeTabsRegistry.get(id)) throw new Error(`home-tab-not-registered:${tabId}`);
        actions.navigate('home');
        selectFoliumHomeTab(id);
    },
    navigate: (view: 'home' | 'player') => {
        if (view !== 'home' && view !== 'player') throw new Error(`ui.navigate: unknown view "${String(view)}"`);
        requireActions('ui', context).navigate(view);
    },
    openVolume: () => requireActions('ui', context).openVolume(),
    pickFile: async (options: { accept?: 'video' | 'audio' | 'image' | 'any'; persist?: boolean } = {}) => {
        if (context !== 'main') throw new Error(`ui-unavailable-in-${context}-context`);
        const response = await invokeModPickFile(mod.id, options.accept ?? 'any', options.persist === true);
        if (!response.ok) throw new Error(response.error ?? 'pick-file-failed');
        return (response.result as FoliumFileHandle | null) ?? null;
    },
    restoreFile: async (grantId: string) => {
        if (context !== 'main') throw new Error(`ui-unavailable-in-${context}-context`);
        if (typeof grantId !== 'string' || !grantId) return null;
        const response = await invokeModRestoreFile(mod.id, grantId);
        if (!response.ok) throw new Error(response.error ?? 'restore-file-failed');
        return (response.result as FoliumFileHandle | null) ?? null;
    },
    releaseFile: async (grantId: string) => {
        if (context !== 'main') throw new Error(`ui-unavailable-in-${context}-context`);
        if (typeof grantId !== 'string' || !grantId) return;
        const response = await invokeModReleaseFile(mod.id, grantId);
        if (!response.ok) throw new Error(response.error ?? 'release-file-failed');
    },
    embed: (container: HTMLElement, url: string, options?: { title?: string; allow?: string[] }) => {
        if (context !== 'main') throw new Error(`ui-unavailable-in-${context}-context`);
        return createEmbed(mod, container, url, options);
    },
    // Loaded on first use: the icon table alone lists every lucide icon.
    icon: async (name: string, options?: FoliumIconOptions) => (await import('./icons')).createFoliumIcon(name, options),
});

const buildResponse = (raw: { status: number; statusText: string; headers: Record<string, string>; body: string }): FoliumFetchResponse => {
    const headers = Object.freeze({ ...raw.headers });
    return Object.freeze({
        ok: raw.status >= 200 && raw.status < 300,
        status: raw.status,
        statusText: raw.statusText,
        headers,
        text: () => raw.body,
        json: <T>() => JSON.parse(raw.body) as T,
    });
};

export const createFoliumNetService = (mod: ModRuntimeInfo, context: FoliumContextKind): FoliumNetService => Object.freeze({
    fetch: async (url: string, init: FoliumFetchInit = {}) => {
        if (context !== 'main') throw new Error(`net-unavailable-in-${context}-context`);
        const response = await invokeModNetFetch(mod.id, String(url), init);
        if (!response.ok) throw new Error(response.error ?? 'net-fetch-failed');
        return buildResponse(response.result as { status: number; statusText: string; headers: Record<string, string>; body: string });
    },
});
