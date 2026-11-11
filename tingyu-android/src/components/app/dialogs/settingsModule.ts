import { navigationMark } from '../../../services/navigationTiming';
import { scheduleUiWarmup } from '../../../services/uiWarmup';
import { registerStartupPreload } from '../../../services/startupPreload';
// src/components/app/dialogs/settingsModule.ts
// Reuse the same module promise for idle warmup, pointer intent and React.lazy.
let pending:ReturnType<typeof importSettings>|undefined;
let loaded:Awaited<ReturnType<typeof importSettings>>|undefined;
const importSettings=()=>{const at=Date.now();navigationMark('settings-import-start');return import('../../modal/SettingsModal').then(value=>{navigationMark('settings-import-ready',at);return value})};
export const peekSettingsModule=()=>loaded;
export function loadSettingsModule(){return pending??=importSettings().then(value=>{loaded=value;return value},error=>{pending=undefined;throw error})}
export function warmSettingsModule(){void loadSettingsModule().catch(()=>{})}

export function scheduleSettingsWarmup(){return scheduleUiWarmup(loadSettingsModule,'settings')}
registerStartupPreload(loadSettingsModule);
