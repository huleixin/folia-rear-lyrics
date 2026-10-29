import { validateRemoteUrl } from './contract';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

// src/services/lxSource/http.ts
export async function lxHttp(url: string, options: Record<string, unknown>, signal: AbortSignal, redirects=0): Promise<{statusCode:number;headers:Record<string,string>;body:unknown}> {
    validateRemoteUrl(url);
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(options.headers || {})) {
        if (!/^(cookie|host|origin)$/i.test(key)) headers[key] = String(value);
    }
    const timeout = Math.min(30000, Math.max(1000, Number(options.timeout) || 15000));
    const method = String(options.method || 'GET').toUpperCase();
    if (!['GET','POST','PUT','DELETE','PATCH','HEAD'].includes(method)) throw Error('HTTP method unsupported');
    let body = options.body;
    if (options.form) { body = new URLSearchParams(options.form as Record<string, string>).toString(); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    if (options.formData) throw Error('此版本不支持音源 multipart 上传');
    if (body && typeof body !== 'string') { body = JSON.stringify(body); headers['Content-Type'] ||= 'application/json'; }
    if (String(body || '').length > 1048576) throw Error('Request too large');
    if (signal.aborted) throw Error('Cancelled');
    if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.request({ url, method, headers, data: body, connectTimeout: timeout, readTimeout: timeout, disableRedirects: true, responseType: 'text' });
        if (signal.aborted) throw Error('Cancelled');
        if (String(response.data || '').length > 2097152) throw Error('Response too large');
        const location=Object.entries(response.headers).find(([key])=>key.toLowerCase()==='location')?.[1];
        if([301,302,303,307,308].includes(response.status)&&location){
            if(redirects>=5)throw Error('音源重定向次数过多');
            const next=new URL(location,url);validateRemoteUrl(next.href);
            const nextOptions={...options,headers:{...headers}};
            if(next.origin!==new URL(url).origin)for(const key of Object.keys(nextOptions.headers))if(/^(authorization|cookie|x-token)$/i.test(key))delete nextOptions.headers[key];
            if(response.status===303||([301,302].includes(response.status)&&method==='POST')){Object.assign(nextOptions,{method:'GET',body:undefined,form:undefined});}
            return lxHttp(next.href,nextOptions,signal,redirects+1);
        }
        let result = response.data;
        try { result = JSON.parse(result); } catch { /* text responses are allowed */ }
        return { statusCode: response.status, headers: response.headers, body: result };
    }
    const response = await fetch(url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : body as string, signal, credentials: 'omit', redirect: 'error' });
    const text = await response.text();
    if (text.length > 2097152) throw Error('Response too large');
    let result: unknown = text; try { result = JSON.parse(text); } catch { /* text */ }
    return { statusCode: response.status, headers: Object.fromEntries(response.headers.entries()), body: result };
}
