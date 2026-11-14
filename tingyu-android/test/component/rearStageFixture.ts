import type { ObsBrowserSourceConfig } from '../../src/types/obsBrowserSource';
import type { VisualizerMode } from '../../src/types';

// test/component/rearStageFixture.ts
export function rearStageConfig(mode: VisualizerMode): ObsBrowserSourceConfig {
    return {
        activePlaybackContext: 'main', stageSource: null, hasTrack: true,
        song: { id: 'compatibility-qa', name: 'Stage compatibility' }, songArtist: 'QA', songAlbum: null, coverUrl: null,
        lyrics: { lines: [{ fullText: '风吹过听屿 Hello music', startTime: 0, endTime: 213,
            words: [{ text: '风吹过听屿 Hello music', startTime: 0, endTime: 213 }] }], isWordByWord: false },
        theme: { name: 'QA', backgroundColor: '#183126', primaryColor: '#ffffff', secondaryColor: '#b1dcc9',
            accentColor: '#86d8b8', fontStyle: 'sans', animationIntensity: 'normal' },
        isDaylight: false, visualizerMode: mode, lyricsFontScale: 1, visualizerOpacity: 1, subtitleOverlayOpacity: 1,
        staticMode: true, hideTranslationSubtitle: false, seed: 'qa', rearTapControls: true, updatedAt: 1,
    };
}
