// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {useIcuFoliaSegmentation} from '@/hooks/useIcuFoliaSegmentation';

// test/unit/hooks/icuStageDemand.test.ts
const state=vi.hoisted(()=>({view:'home',rear:false,sleeping:false,preview:false,foreground:true,load:vi.fn(async()=>true)}));
vi.mock('@/utils/platform',()=>({isAndroidNativeRuntime:()=>true}));
vi.mock('@/stores/useAppViewStore',()=>({useAppViewStore:(s:any)=>s({view:state.view})}));
vi.mock('@/stores/useRearRuntimeStore',()=>({useRearRuntimeStore:(s:any)=>s({enabled:state.rear,sleeping:state.sleeping})}));
vi.mock('@/stores/useSettingsModalStore',()=>({useSettingsModalStore:(s:any)=>s({isSubSettingsViewOpen:state.preview})}));
vi.mock('@/hooks/useStageActivity',()=>({useMainStageActive:()=>state.foreground}));
vi.mock('@/stores/usePlaybackStore',()=>({usePlaybackStore:(s:any)=>s({lyrics:{lines:[{fullText:'恢复的中文歌词'}]}}),setLyricsState:vi.fn()}));
vi.mock('@/components/visualizer/registry',()=>({getVisualizerRegistryEntry:()=>({usesWordSegmentation:true})}));
vi.mock('@/utils/lyrics/icuFolia',()=>({loadIcuFolia:state.load,applyAutoWordSegmentation:vi.fn()}));
vi.mock('@/services/hostExtensionHooks',()=>({applyLyricsTransform:vi.fn(),untransformedLyrics:(v:any)=>v}));
vi.mock('@/services/lyricSegmentationWorker',()=>({segmentLyricsOffThread:state.load,applySegmentResults:vi.fn()}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined;
function Probe(){useIcuFoliaSegmentation('classic');return null}
async function render(){await act(async()=>{root??=createRoot(document.createElement('div'));root.render(React.createElement(Probe))})}
afterEach(()=>{act(()=>root?.unmount());root=undefined;Object.assign(state,{view:'home',rear:false,sleeping:false,preview:false,foreground:true});vi.clearAllMocks()});
it('does not load the dictionary for restored lyrics on the home page',async()=>{await render();expect(state.load).not.toHaveBeenCalled()});
it('loads for the visible stage and also for rear-only lyrics',async()=>{
    state.view='player';await render();expect(state.load).toHaveBeenCalledTimes(1);
    state.view='home';await render();state.rear=true;await render();expect(state.load).toHaveBeenCalledTimes(2);
});
it('ignores sleeping displays but supports a visible settings preview',async()=>{
    state.rear=true;state.sleeping=true;state.foreground=false;await render();expect(state.load).not.toHaveBeenCalled();
    state.preview=true;state.foreground=true;await render();expect(state.load).toHaveBeenCalledTimes(1);
});
