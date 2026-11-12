// Frame-interval feedback only; no playback position, audio scheduling or global FPS cap.
const LEVELS = [1, 0.875, 0.75, 0.625, 0.5] as const;
export class AdaptiveStageQuality {
    private level = 0;
    private previous = 0;
    private started = 0;
    private samples: number[] = [];
    private healthyWindows = 0;
    private fastest = 1000 / 60;
    constructor(scale = 1) {
        const index = LEVELS.findIndex(value => value <= scale);
        this.level = index < 0 ? LEVELS.length - 1 : index;
    }
    get scale() { return LEVELS[this.level]; }
    resetWindow() { this.previous = 0; this.started = 0; this.samples.length = 0; this.healthyWindows = 0; }
    /** Warm up for four seconds; decide only from sustained, non-idle samples. */
    sample(now: number, frameRate: number | 'off'): number | null {
        if (!this.started) this.started = now;
        const gap = this.previous ? now - this.previous : 0;
        this.previous = now;
        if (gap <= 0) return null;
        if (gap > 250) { this.resetWindow(); return null; }
        this.fastest = Math.min(this.fastest, gap);
        if (now - this.started < 4000) return null;
        this.samples.push(gap);
        if (now - this.started < 12000 || this.samples.length < 60) return null;
        this.samples.sort((a, b) => a - b);
        const p90 = this.samples[Math.floor(this.samples.length * .9)];
        // Manual caps are intentional. Dynamic display refresh reductions must not cause a spiral.
        const median = this.samples[Math.floor(this.samples.length * .5)];
        const displayInterval = [1000 / 30, 1000 / 60, 1000 / 90, 1000 / 120].find(interval => Math.abs(median - interval) < .8 && p90 < median * 1.08);
        const cadence = frameRate === 'off' ? displayInterval ?? this.fastest : Math.max(this.fastest, 1000 / frameRate);
        const budget = Math.max(1000 / 90, cadence) * 1.28;
        const oldLevel = this.level;
        if (p90 > budget && this.level < LEVELS.length - 1) { this.level++; this.healthyWindows = 0; }
        else if (p90 < cadence * 1.1) {
            if (++this.healthyWindows >= 3 && this.level > 0) { this.level--; this.healthyWindows = 0; }
        } else this.healthyWindows = 0;
        this.samples.length = 0;
        this.started = now - 4000;
        return oldLevel === this.level ? null : this.scale;
    }
}
