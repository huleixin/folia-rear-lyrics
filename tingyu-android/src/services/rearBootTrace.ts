// src/services/rearBootTrace.ts
// Fixed vocabulary only: no song, URL query, credentials or user content crosses this probe.
const sent=new Set<string>();
export function rearBootTrace(stage:string){
    if(sent.has(stage)||sent.size>=16)return;
    sent.add(stage);
    void fetch('/__folia_rear/boot?stage='+encodeURIComponent(stage),{cache:'no-store'}).catch(()=>undefined);
}
