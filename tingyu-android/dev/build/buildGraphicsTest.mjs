import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// dev/build/buildGraphicsTest.mjs
// Uses the shipping package/code/signature so the normal APK can replace it without data deletion.
process.chdir(fileURLToPath(new URL('../..',import.meta.url)));
const env={...process.env,VITE_TINGYU_GRAPHICS_DIAGNOSTICS:'true'};
for(const [bin,args] of [['npm',['run','build:capacitor']],['npx',['cap','copy','android']]]){
    const result=spawnSync(process.platform==='win32'?`${bin}.cmd`:bin,args,{env,stdio:'inherit',shell:process.platform==='win32'});
    if(result.status!==0)process.exit(result.status??1);
}
console.log('Graphics assets ready. Build with -PtingyuGraphicsDiagnostics=true. Default engine unchanged; diagnostics are opt-in.');
