import type { ObsBrowserSourceAudio, ObsBrowserSourceClock, ObsBrowserSourceConfig } from './obsBrowserSource';

// Playback/config contract shared by OBS and the on-device rear lyrics surface.
export interface LyricsSurfaceEvents {
    config: (config: ObsBrowserSourceConfig) => void;
    clock: (clock: ObsBrowserSourceClock) => void;
    audio: (audio: ObsBrowserSourceAudio) => void;
    connected: (connected: boolean) => void;
}
export interface LyricsSurfaceTransport {
    subscribe: (events: LyricsSurfaceEvents) => () => void;
}
