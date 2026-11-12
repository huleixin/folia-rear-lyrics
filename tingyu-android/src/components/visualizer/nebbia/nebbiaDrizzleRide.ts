import type { NebbiaGlassMotion } from './nebbiaDrops';
import type { VocalEnvelope } from './nebbiaVocalEnvelope';
// Bass onsets drive the bus; the existing vocal frequency band drives rain.
export class NebbiaDrizzleRide {
    readonly env: VocalEnvelope | null = null;
    rain = 1;
    step(motion: NebbiaGlassMotion, now: number, frozen: boolean, bump: number, bumps: boolean, kick: number, on: boolean, strength: number) {
        motion.beginFrame(now, frozen, bumps && !on);
        if (on && bumps && !frozen && kick > 0 && bump > 0 && strength > 0) motion.trigger(now, kick * strength);
        this.rain = on ? strength : 1;
    }
}
