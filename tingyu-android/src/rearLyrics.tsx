import React from 'react';
import {setRearAod} from './services/rearAodRuntime';
import {rearBootTrace} from './services/rearBootTrace';
import ReactDOM from 'react-dom/client';
import './i18n/config';
import './index.css';
import RearLyricsSurface from './components/rear/RearLyricsSurface';
import RearLyricsPanel from './components/rear/RearLyricsPanel';
import { installGlobalVisualizerFrameRateLimiter } from './utils/frameRateLimiter';

// The rear screen mounts only Folia's shared lyric renderer, never the player application or its navigation.
rearBootTrace('js-entry');
installGlobalVisualizerFrameRateLimiter(undefined, true);
window.addEventListener('folia-rear-mode',event=>{setRearAod((event as CustomEvent<{mode:string}>).detail?.mode==='AOD');});
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

const aodCss=document.createElement('style');aodCss.textContent='html[data-rear-aod=true] *,html[data-rear-aod=true] *::before,html[data-rear-aod=true] *::after{animation-play-state:paused!important;transition:none!important}';document.head.appendChild(aodCss);
