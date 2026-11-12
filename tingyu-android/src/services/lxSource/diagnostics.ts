// src/services/lxSource/diagnostics.ts
export type LxFailure = 'import'|'init'|'host-api'|'timeout'|'parameters'|'resolve'|'invalid-url'|'quality'|'switch'|'http'|'stale'|'player';
const entries: {at:number;stage:string;category:LxFailure;detail:string}[]=[];
export function redactLx(value: unknown): string {
    return String(value instanceof Error ? value.message : value)
        .replace(/https?:\/\/[^\s"'<>]+/gi,'[地址]')
        .replace(/\bBearer\s+[^\s,;]+/gi,'Bearer [已脱敏]')
        .replace(/\b(authorization|cookie|set-cookie|[\w-]*token|secret|api[_-]?key|signature|password|auth|sign|session(?:id)?|jwt|key)\b["']?\s*[:=]\s*[^\r\n]+/gi,'$1=[已脱敏]')
        .replace(/[\r\n\t]/g,' ').slice(0,200);
}
export function classifyLx(value: unknown): LxFailure {
    const text=String(value instanceof Error ? value.message : value);
    if(/timeout|timed out|超时/i.test(text))return 'timeout';
    if(/not defined|not a function|unsupported.*utility|宿主/i.test(text))return 'host-api';
    if(/quality|音质/i.test(text))return 'quality';
    if(/URL|地址|url/i.test(text))return 'invalid-url';
    if(/Promise|parameter|参数|操作/i.test(text))return 'parameters';
    return 'resolve';
}
export function noteLx(stage:string,category:LxFailure,detail:unknown) {
    entries.push({at:Date.now(),stage:stage.replace(/[^a-z0-9-]/gi,'').slice(0,24),category,detail:redactLx(detail)});
    if(entries.length>80)entries.shift();
}
export const getLxDiagnosticLines=()=>['','LX custom source diagnostics:',...entries.map(e=>`  ${new Date(e.at).toISOString()} ${e.stage} ${e.category}: ${e.detail}`)];
