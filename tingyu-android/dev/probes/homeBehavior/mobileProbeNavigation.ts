import type { GridViewCollectionDescriptor } from '../../../src/components/app/home/gridViewCollectionAdapters';
import { useCollectionNavigationStore, notifyCollectionPop } from '../../../src/stores/useCollectionNavigationStore';
import { resolveCollectionPopTo } from '../../../src/library/core/model/collectionNavigation';

// dev/probes/homeBehavior/mobileProbeNavigation.ts
export const isProbeSandbox=()=>Boolean(navigator.webdriver)||new URLSearchParams(location.search).has('sandbox');
export const onProbeBackCollection=()=>{
    const store=useCollectionNavigationStore.getState(),snapshot=store.snapshot;
    const next=snapshot&&snapshot.stack.length>1?{...snapshot,stack:snapshot.stack.slice(0,-1)}:null;
    notifyCollectionPop(next);store.restore(next);
};
export const onProbePushCollection=(collection:GridViewCollectionDescriptor)=>{if(useCollectionNavigationStore.getState().push(collection).kind==='back')onProbeBackCollection();};
export const onProbePopCollectionTo=(depth:number)=>{const next=resolveCollectionPopTo(useCollectionNavigationStore.getState().snapshot,depth);if(next!==undefined){notifyCollectionPop(next);useCollectionNavigationStore.getState().restore(next);}};
