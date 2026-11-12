import LxWorker from './runtime.worker?worker';
import { lxHttp } from './http';
import { validateCapabilities, type LxScript, type LxCapabilities } from './contract';
import { noteLx, classifyLx } from './diagnostics';

// src/services/lxSource/client.ts
export class LxRuntime {
    private worker = new LxWorker();
    private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    private network = new Map<number, AbortController>();
    private timers = new Map<number, ReturnType<typeof setTimeout>>();
    private serial = 0;
    private closed = false;
    private initialized = false;
    updateAlert: {log:string;updateUrl?:string} | null = null;
    get isClosed(): boolean { return this.closed; }
    readonly ready: Promise<LxCapabilities>;
    private initResolve!: (value: LxCapabilities) => void;
    private initReject!: (reason: Error) => void;
    private initTimer: ReturnType<typeof setTimeout>;
    constructor(script: Pick<LxScript, 'code' | 'name' | 'version' | 'description' | 'author' | 'homepage'>) {
        this.ready = new Promise((resolve, reject) => { this.initResolve = resolve; this.initReject = reject; });
        this.initTimer = setTimeout(() => this.stop(new Error('音源初始化超时')), 65000);
        this.worker.onerror = event => this.stop(new Error(event.message || '音源运行失败'));
        this.worker.onmessage = event => void this.receive(event.data);
        this.worker.postMessage({ kind: 'init', code: script.code, metadata: { ...script, code: undefined, rawScript: script.code } });
    }
    private async receive(data: any) {
        if (this.closed) return;
        if (data.kind === 'fatal') return this.stop(new Error(String(data.error)));
        if (data.kind === 'inited') {
            if (this.initialized) return;
            try { const capabilities = validateCapabilities(data.data?.sources); this.initialized=true; clearTimeout(this.initTimer); this.initResolve(capabilities); noteLx('init','init',`ready sources=${Object.keys(capabilities).join(',')}`); }
            catch (error) { this.stop(error as Error); }
        } else if (data.kind === 'updateAlert') {
            if (!this.updateAlert && typeof data.data?.log === 'string') this.updateAlert = {log:data.data.log.slice(0,1024),updateUrl:data.data.updateUrl};
        } else if (data.kind === 'result') {
            const task = this.pending.get(data.id); if (!task) return;
            clearTimeout(task.timer); this.pending.delete(data.id);
            if(data.error) {noteLx('request',classifyLx(data.error),data.error);task.reject(new Error(String(data.error)));}else task.resolve(data.value);
        } else if (data.kind === 'http') {
            if (this.network.size >= 12) return this.stop(new Error('音源同时请求过多'));
            const controller = new AbortController(); this.network.set(data.id, controller);
            const timer = setTimeout(() => controller.abort(), (typeof data.options?.timeout==='number'&&data.options.timeout>0?Math.min(60000,data.options.timeout):13000)+100);
            try { const response = await lxHttp(String(data.url), data.options || {}, controller.signal); if (!this.closed) this.worker.postMessage({ kind: 'deliver', id: data.id, response }); }
            catch (error) { if (!this.closed) this.worker.postMessage({ kind: 'deliver', id: data.id, error: String(error) }); }
            finally { clearTimeout(timer); this.network.delete(data.id); }
        } else if (data.kind === 'timer') {
            if (this.timers.size > 32) return this.stop(new Error('音源定时器过多'));
            const timer = setTimeout(() => { this.timers.delete(data.id); if (!this.closed) this.worker.postMessage({ kind: 'deliver', id: data.id, timer: true }); }, Math.min(2147483647, Math.max(0, Number(data.ms) || 0)));
            this.timers.set(data.id, timer);
        } else if (data.kind === 'cancel') {
            this.network.get(data.id)?.abort(); clearTimeout(this.timers.get(data.id)); this.timers.delete(data.id);
        }
    }
    async request(payload: unknown, timeoutMs=65000): Promise<unknown> {
        await this.ready;
        if (this.closed) throw Error('音源已停止');
        const id = ++this.serial;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => this.stop(new Error('音源取流超时')), Math.max(1,Math.min(65000,timeoutMs)));
            this.pending.set(id, { resolve, reject, timer });
            this.worker.postMessage({ kind: 'request', id, payload });
        });
    }
    stop(error = new Error('音源已切换或停用')) {
        if (this.closed) return;
        if (!this.initialized || this.pending.size) noteLx(this.initialized?'request':'init',classifyLx(error),error);
        this.closed = true; this.worker.terminate(); clearTimeout(this.initTimer);
        this.initReject(error);
        this.pending.forEach(task => { clearTimeout(task.timer); task.reject(error); }); this.pending.clear();
        this.network.forEach(controller => controller.abort()); this.network.clear();
        this.timers.forEach(clearTimeout); this.timers.clear();
    }
}
