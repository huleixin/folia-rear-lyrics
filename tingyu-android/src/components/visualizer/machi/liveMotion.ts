import type { AudioBands } from '../../../types';
import { StageBandMotion } from '../stageBandMotion';
// Live band onsets mapped to the existing scene effects; no stem or beat-grid claims.
export const DRUM_KICK = 0, DRUM_SNARE = 1;
export interface DrumHits { times: ArrayLike<number>; strengths: ArrayLike<number>; kinds: ArrayLike<number>; until?: number }
export class MachiLiveMotion {
    readonly bands = new StageBandMotion();
    hits: {times:number[];strengths:number[];kinds:number[]} = {times:[],strengths:[],kinds:[]};
    reset() { this.bands.reset(); this.hits = {times:[],strengths:[],kinds:[]}; }
    sample(time: number, audio: AudioBands, frozen: boolean) {
        const previous = this.bands.events;
        const count = previous.length;
        this.bands.sample(time,audio,frozen);
        if (previous !== this.bands.events) this.hits = {times:[],strengths:[],kinds:[]};
        const event = this.bands.events.at(-1);
        const fresh = this.bands.events.length > count || previous !== this.bands.events;
        if (!fresh || !event) return;
        const keep = this.hits.times.findIndex(t => t >= time - 4);
        const from = keep < 0 ? this.hits.times.length : keep;
        this.hits = {times:this.hits.times.slice(from), strengths:this.hits.strengths.slice(from), kinds:this.hits.kinds.slice(from)};
        if (this.bands.kick > 0) { this.hits.times.push(time);this.hits.strengths.push(this.bands.kick);this.hits.kinds.push(DRUM_KICK); }
        // Broadband onset drives a screen swell; it is not labeled a separated snare.
        this.hits.times.push(time);this.hits.strengths.push(event.impact ?? .5);this.hits.kinds.push(DRUM_SNARE);
    }
}
