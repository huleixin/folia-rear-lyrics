import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n/config';
import './index.css';
import RearLyricsSurface from './components/rear/RearLyricsSurface';
import RearLyricsPanel from './components/rear/RearLyricsPanel';
import { installGlobalVisualizerFrameRateLimiter } from './utils/frameRateLimiter';

// The rear screen mounts only Folia's shared lyric renderer, never the player application or its navigation.
installGlobalVisualizerFrameRateLimiter(undefined, true);
const lyricsOnly = new URLSearchParams(window.location.search).get('layer') === 'lyrics';
if (lyricsOnly) {
    document.documentElement.dataset.foliaSurface = 'rear-lyrics-panel';
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    document.getElementById('root')!.style.backgroundColor = 'transparent';
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>
    {lyricsOnly ? <RearLyricsPanel /> : <RearLyricsSurface />}
</React.StrictMode>);
