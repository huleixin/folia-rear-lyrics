import { useNativeAudioDeck } from './useNativeAudioDeck';
import { PLAYBACK_TEST_BUILD } from '../utils/playbackEngineTestBuild';

// src/hooks/usePlaybackTestDeck.ts
const useVerifiedDeck = () => ({ suppressBrowserSource: false });
// A build-time gate: the shipping app never acquires experimental native ownership.
export const usePlaybackTestDeck = PLAYBACK_TEST_BUILD ? useNativeAudioDeck : useVerifiedDeck;
