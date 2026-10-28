// src/services/nativeShellCommit.ts
// A navigation action updates several stores. Publish their final state once, and
// flush it before page/control packets so those packets carry the matching route token.
let publisher:(()=>void)|undefined,pending=false;
export function setNativeShellPublisher(value:()=>void){publisher=value}
export function flushNativeShellRoute(){pending=false;publisher?.()}
export function scheduleNativeShellRoute(){if(pending)return;pending=true;queueMicrotask(()=>{if(pending)flushNativeShellRoute()})}
