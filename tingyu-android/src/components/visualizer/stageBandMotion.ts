import type { AudioBands } from '../../types';
import type { BeatFxEvent } from '../../services/beatFx/clock';

// Lightweight live-band onsets. Samples use the existing lyric clock, never a second playhead.
// This is frequency-band motion, not stem separation or a claimed metrical beat grid.
export class StageBandMotion {
    events: BeatFxEvent[] = [];
    kick = 0;
    private lastTime = NaN;
    private lastBeat = -Infinity;
    private lastKick = -Infinity;
    private previousLow = 0;
    private previousEnergy = 0;
    private floorLow = 0;
    private floorEnergy = 0;
    private warmUntil = Infinity;

    reset() {
        this.events = [];
        this.kick = 0;
        this.lastTime = NaN;
        this.lastBeat = this.lastKick = -Infinity;
    }

    /** Reject seeks/pauses and sustained energy; retain array identity while appending onsets. */
    sample(time: number, bands: AudioBands, frozen: boolean) {
        this.kick = 0;
        const bounded = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n / 255)) : 0;
        const low = bounded(bands.bass.get());
        const energy = low * .45 + bounded(bands.lowMid.get()) * .2 + bounded(bands.mid.get()) * .2 + bounded(bands.treble.get()) * .15;
        const dt = time - this.lastTime;
        if (frozen || !bands.spectrum?.get().length || !Number.isFinite(time) || !Number.isFinite(dt) || dt < 0 || dt > .5) {
            this.reset();
            this.lastTime = time;
            this.previousLow = this.floorLow = low;
            this.previousEnergy = this.floorEnergy = energy;
            this.warmUntil = time + .25;
            return;
        }
        if (dt === 0) return;
        const smooth = 1 - Math.exp(-dt / .65);
        const kick = low > .055 && low > this.floorLow * 1.25 + .015 && low - this.previousLow > .022;
        const beat = energy > .04 && energy > this.floorEnergy * 1.2 + .01 && energy - this.previousEnergy > .015;
        if (time >= this.warmUntil) {
            if (kick && time - this.lastKick >= .3) {
                this.kick = Math.min(1, Math.max(.35, (low - this.floorLow) * 3));
                this.lastKick = time;
            }
            if ((beat || this.kick > 0) && time - this.lastBeat >= .22) {
                // Bound memory on long radio sessions; consumers re-seek when a new batch starts.
                if (this.events.length >= 512) this.events = [];
                this.events.push({ t: time, kind: 'beat', impact: Math.min(1, Math.max(.35, (energy - this.floorEnergy) * 4, this.kick)), rhythmic: true });
                this.lastBeat = time;
            }
        }
        this.floorLow += (low - this.floorLow) * smooth;
        this.floorEnergy += (energy - this.floorEnergy) * smooth;
        this.previousLow = low;
        this.previousEnergy = energy;
        this.lastTime = time;
    }
}
