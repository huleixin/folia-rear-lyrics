/** A shared budget for recommendation work. A caller abort never frees an occupied transport slot. */
export class DiscoveryRequestCache {
    private active = 0;
    private waiting: Array<() => void> = [];
    private pending = new Map<string, Promise<unknown>>();
    private cache = new Map<string, { value: unknown; expires: number }>();
    constructor(private concurrency = 2, private capacity = 80) {}

    private async run<T>(work: () => Promise<T>): Promise<T> {
        if (this.active >= this.concurrency) await new Promise<void>(resolve => this.waiting.push(resolve));
        else this.active++;
        try { return await work(); }
        finally { const next = this.waiting.shift(); if (next) next(); else this.active--; }
    }

    read<T>(key: string, ttl: number, work: () => Promise<T>, signal?: AbortSignal, refresh = false): Promise<T> {
        if (signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
        const cached = this.cache.get(key);
        if (!refresh && cached && cached.expires > Date.now()) return Promise.resolve(cached.value as T);
        let task = this.pending.get(key) as Promise<T> | undefined;
        if (!task) {
            task = this.run(work).then(value => {
                this.cache.delete(key);
                this.cache.set(key, { value, expires: Date.now() + ttl });
                while (this.cache.size > this.capacity) this.cache.delete(this.cache.keys().next().value!);
                return value;
            }).finally(() => this.pending.delete(key));
            this.pending.set(key, task);
        }
        return new Promise<T>((resolve, reject) => {
            const abort = () => reject(new DOMException('Cancelled', 'AbortError'));
            signal?.addEventListener('abort', abort, { once: true });
            task!.then(value => { if (!signal?.aborted) resolve(value); }, reject)
                .finally(() => signal?.removeEventListener('abort', abort));
        });
    }
}
