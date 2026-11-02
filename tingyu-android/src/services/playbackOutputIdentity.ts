// src/services/playbackOutputIdentity.ts
// Read-only identities of existing output leases. No player, timer or independent authority.
export type OutputIdentity={sessionId:string;songKey:string;epoch:string};
const outputs=new WeakMap<HTMLMediaElement,()=>OutputIdentity>();
let compatibleLease='';
export const bindOutputIdentity=(element:HTMLMediaElement,read?:()=>OutputIdentity)=>{if(read)outputs.set(element,read);else outputs.delete(element);};
export const nativeAudioIdentity=(element:HTMLMediaElement|null)=>element?outputs.get(element)?.():undefined;
export const compatibleOutputSession=()=>compatibleLease;
export const setCompatibleOutputSession=(lease:string)=>{compatibleLease=lease;};
