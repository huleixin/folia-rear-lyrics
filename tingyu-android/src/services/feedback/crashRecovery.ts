import {readCrashDiagnostics,type CrashDiagnosticEntry} from '../../utils/crashDiagnostics';
import {openFeedback} from './navigation';

// src/services/feedback/crashRecovery.ts: once per prior failure, never uploads during startup.
const started=typeof performance==='undefined'?Date.now():performance.timeOrigin,key='tingyu-feedback-crash-seen';
export function previousFailure(entries:CrashDiagnosticEntry[],before:number){return entries.filter(e=>e.at<before&&e.at>Date.now()-30*86400000&&/uncaught|window-error|unhandled-rejection|renderer|crash|anr/i.test(e.source+' '+e.type)).sort((a,b)=>b.at-a.at)[0];}
export async function offerCrashFeedback(){try{const e=previousFailure(await readCrashDiagnostics(),started);if(!e)return;const id=e.at+'|'+e.source+'|'+e.type;if(localStorage.getItem(key)===id)return;await openFeedback(true);localStorage.setItem(key,id);}catch{/* A broken diagnostic store must not prevent startup. */}}
