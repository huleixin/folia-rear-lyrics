import type { PageActions, PageEvent } from '../types/nativePages';

// src/utils/nativePageActions.ts
// Native caches may show a previous list window. Resolve its stable identity against current data.
export function pageRowActions(base:PageActions,resolve:(id:string)=>((event:PageEvent)=>void)|undefined):PageActions {
    return new Proxy(base,{get(target,key){if(typeof key!=='string')return undefined;return target[key]??resolve(key)}});
}
