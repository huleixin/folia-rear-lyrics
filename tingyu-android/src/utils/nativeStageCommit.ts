// src/utils/nativeStageCommit.ts
// Store subscribers run before React's commit; native may reveal only a committed stage DOM.
export const canPublishNativeStage=(route:string,root:Element|null)=>
    route!=='stage'||root?.getAttribute('data-folia-player-view')==='true';
