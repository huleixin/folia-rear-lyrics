import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';

// Original package/signature/code: replacement needs no data deletion and the next stable can upgrade.
process.chdir(fileURLToPath(new URL('../..',import.meta.url)));
const env={...process.env,TINGYU_FEEDBACK_TEST:'true'};
function run(bin,args){const r=spawnSync(process.platform==='win32'?bin+'.cmd':bin,args,{env,stdio:'inherit',shell:process.platform==='win32'});if(r.status!==0)process.exit(r.status??1);}
run('npm',['run','build:capacitor']);
const version=JSON.parse(readFileSync('package.json')).version+'-feedback-test.1';
writeFileSync('dist/tingyu-feedback-test.json',JSON.stringify({version,testBuild:true}));
run('npx',['cap','sync','android']);
console.log('Feedback test assets ready; assembleRelease with -PtingyuFeedbackTest=true.');
