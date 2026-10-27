// src/components/app/dialogs/settingsModule.ts
// Reuse the same module promise for idle warmup, pointer intent and React.lazy.
let pending:ReturnType<typeof importSettings>|undefined;
const importSettings=()=>import('../../modal/SettingsModal');
export function loadSettingsModule(){return pending??=importSettings()}
export function warmSettingsModule(){void loadSettingsModule().catch(()=>{pending=undefined})}
