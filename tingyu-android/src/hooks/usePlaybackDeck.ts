import { useNativeAudioDeck } from './useNativeAudioDeck';

// src/hooks/usePlaybackDeck.ts
// The native deck is the only audio owner candidate. It keeps the WebView element as the
// fallback: unsupported URIs, audio effects and a failed native attempt all resolve to it
// before this returns `suppressBrowserSource: false`.
export const usePlaybackDeck = useNativeAudioDeck;
