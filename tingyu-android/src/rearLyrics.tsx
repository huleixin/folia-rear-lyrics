import React from 'react';
import {applyRearMode,type RearModeReceipt} from './services/rearAodRuntime';
import {rearBootTrace} from './services/rearBootTrace';
import ReactDOM from 'react-dom/client';
import './i18n/config';
import './index.css';
import './components/rear/rearAod.css';
import RearLyricsSurface from './components/rear/RearLyricsSurface';
import RearLyricsPanel from './components/rear/RearLyricsPanel';
import { installGlobalVisualizerFrameRateLimiter } from './utils/frameRateLimiter';

// The rear screen mounts only Folia's shared lyric renderer, never the player application or its navigation.
rearBootTrace('js-entry');
installGlobalVisualizerFrameRateLimiter(undefined, true);
window.addEventListener('folia-rear-mode',event=>{applyRearMode((event as CustomEvent).detail);});
// A late-loading iframe inherits the full mode/sequence before mounting the lyric renderer.
if(window.parent!==window)try{
    const inherited=(window.parent as Window&{__foliaRearModeReceipt?:RearModeReceipt}).__foliaRearModeReceipt;
    if(inherited)applyRearMode(inherited);
}catch{/* Native mode replay remains authoritative. */}
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
