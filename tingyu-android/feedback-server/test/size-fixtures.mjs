import {sanitizeFeedback, validateFeedback} from "../../src/services/feedback/schema.mjs";
import {mkdirSync, writeFileSync} from "node:fs";

// Synthetic whitelist fixtures only; no user data, credentials or arbitrary padding.
const symbols="state status phase channel engine mode reason type errorType quality provider route stage deviceClass".split(" ");
const nums="durationMs elapsedMs latencyMs bufferMs positionMs count sdk width height fps dropped code errorCode retries statusCode httpStatus bytes epoch attempt ms frameCount jankCount".split(" ");
const flags="playing buffering ready enabled visible native pad connected success owns".split(" ");
export function sizedPayload(target){
  const input={category:"other",description:"Synthetic P0 stability test",steps:"controlled upload",metadata:{version:"feedback-p0",model:"synthetic"},diagnostics:target?{events:[],crashes:[],performance:{}}:null};
  if(!target)return validateFeedback(sanitizeFeedback(input));
  for(let i=0;i<500;i++){
    const f=Object.fromEntries([...symbols.map(k=>[k,"s.".repeat(50)]),...nums.map(k=>[k,123456789]),...flags.map(k=>[k,true])]);
    input.diagnostics.events.push({t:1700000000000+i,m:"feedback",e:"synthetic-upload-error",l:"error",f});
  }
  const frame=" at synthetic."+"Frame".repeat(40)+".run(Synthetic.java:42)";
  for(let i=0;i<10;i++)input.diagnostics.crashes.push({at:1700000000000,source:"js",type:"SyntheticError",stack:Array(256).fill(frame).join("\n")});
  let p=sanitizeFeedback(input);
  // Remove whole structured records until the requested size is reached.
  while(Buffer.byteLength(JSON.stringify(p.diagnostics))>target&&p.diagnostics.crashes.length)p.diagnostics.crashes.pop();
  while(Buffer.byteLength(JSON.stringify(p.diagnostics))>target&&p.diagnostics.events.length)p.diagnostics.events.pop();
  return validateFeedback(p);
}
if(process.argv[2]){
  mkdirSync(process.argv[2],{recursive:true});
  for(const [label,size]of [["none",0],["10k",10240],["100k",102400],["500k",512000],["1m",1048576],["max-schema",5*1048576]]){
    const p=sizedPayload(size),raw=JSON.stringify(p);writeFileSync(process.argv[2]+"/"+label+".json",raw);
    console.log(JSON.stringify({label,bodyBytes:Buffer.byteLength(raw),logBytes:p.diagnostics?Buffer.byteLength(JSON.stringify(p.diagnostics)):0}));
  }
}
