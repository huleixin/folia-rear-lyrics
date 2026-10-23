import type { HomeProbeApi } from './probeApi';
import { useLibrarySuiteStore } from '../../../src/library/core/state/useLibrarySuiteStore';
import { useSearchNavigationStore } from '../../../src/stores/useSearchNavigationStore';
import { listLibrarySuites } from '../../../src/library/registry';
import { getProbeLog, clearProbeCalls, clearProbeRequests } from '../libraryBehavior/probeLog';

// dev/probes/homeBehavior/homeProbeApi.ts
// Mobile regression driver; the retired grid/TUI/wall inspection code is intentionally absent.
type HarnessBindings = Pick<HomeProbeApi, 'sandbox'|'ready'|'remount'|'localSongIds'|'localPlaylists'|'providers'|'activeProvider'|'switchProvider'|'signOut'|'setStage'|'setLattice'>;
export const installHomeProbeApi=(bindings:HarnessBindings):(()=>void)=>{
    const api={...bindings,suite:()=>useLibrarySuiteStore.getState().suite,homeSuite:()=> 'mobile',suites:()=>listLibrarySuites().map(s=>s.id),setSuite:()=>useLibrarySuiteStore.getState().setSuite('mobile'),tab:()=>useSearchNavigationStore.getState().homeViewTab,setTab:(tab:string)=>useSearchNavigationStore.getState().setHomeViewTab(tab as never),calls:()=>getProbeLog().calls,requests:()=>getProbeLog().requests,clearCalls:clearProbeCalls,clearRequests:clearProbeRequests} as unknown as HomeProbeApi;
    window.__homeProbe=api;return()=>{if(window.__homeProbe===api)delete window.__homeProbe;};
};
