import { motionValue } from 'framer-motion';
import { SonnetPixiRuntime } from '../src/components/visualizer/sonnet/createSonnetPixiRuntime';
import { compileSonnetProgram } from '../src/components/visualizer/sonnet/sonnetProgram';
import type { SonnetShotKind } from '../src/components/visualizer/sonnet/types';
import { DEFAULT_SONNET_TUNING, type Line } from '../src/types';
import { FALLBACK_AI_DUAL_THEME } from '../src/services/themeSanitizer';

// dev/sonnetRearProbe.ts
// Exercise every shot template through the real director, including lens effects and live resizing.
export const sonnetRearKinds: SonnetShotKind[] = ['editorial-column','type-impact','fragment-collage',
    'tracking-ribbon','mask-reveal','poster-blocks','quiet-tableau'];
const clock = motionValue(0), zero = motionValue(0);
let runtime: SonnetPixiRuntime | null = null;

export async function mountSonnetRearProbe(options: {
    kind: SonnetShotKind; fontScale?: number; distortion?: number; post?: boolean; inkOnly?: boolean; subtitleSpace?: number; transitionStress?: boolean;
}) {
    runtime?.destroy(); runtime = null;
    document.documentElement.dataset.foliaSurface = 'rear-lyrics-panel';
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0';
    document.body.style.cssText = 'margin:0;background:#101614'; document.body.replaceChildren(host);
    const texts = options.inkOnly ? ['渐渐地忘记了 我只要沿着记忆的路线']
        : ['渐渐地忘记了 赶不上明天','我只要沿着记忆的路线','Send them your heart so they will know someone cares'];
    const lines: Line[] = texts.map((fullText,i) => ({fullText,startTime:i*10,endTime:i*10+8,
        words:[...fullText].map((text,j,a)=>({text,startTime:i*10+j*8/a.length,endTime:i*10+(j+1)*8/a.length}))}));
    const program = compileSonnetProgram(lines,`rear-probe-${options.kind}`);
    for (const paragraph of program.paragraphs) for (const shot of paragraph.shots) shot.kind = options.kind;
    if (options.transitionStress) {
        const paragraph = program.paragraphs[0], first = paragraph.shots[0];
        paragraph.shots = [{ ...first, startTime:0, endTime:4 }, { ...first, id:first.id+'-next', startTime:4, endTime:8 }];
    }
    const tuning = { ...DEFAULT_SONNET_TUNING, cameraIntensity: 1.7, typographyMotion: 1.6,
        enableTransitions: options.transitionStress || !options.inkOnly, postProcessEnabled: options.post ?? false,
        postProcessLensDistortion: options.distortion ?? .3, postProcessLensDispersion: options.post ? 2 : 0,
        postProcessGrain: 0, postProcessRgbShift: options.post ? 1 : 0, postProcessVignette: 0,
        ...(options.inkOnly ? { showBackgroundMg:false,showFixedGeo:false,showGuide:false,showBackgroundDecor:false,
            showGiantDecorativeText:false,outerFrameMode:'none' as const } : {}) };
    clock.set(2);
    runtime = await SonnetPixiRuntime.create({ host, program, songSeed:'sonnet-rear-probe', tuning,
        theme: { ...FALLBACK_AI_DUAL_THEME.dark, primaryColor:'#ffffff', accentColor:'#ffffff', lyricsIcons:[] },
        currentTime:clock, audioPower:zero, audioBands:{bass:zero,lowMid:zero,mid:zero,treble:zero,vocal:zero},
        lyricsFontScale:options.fontScale ?? 1, staticMode:false, transparentBackground:true, paused:true });
    runtime.setSubtitleSpace(options.subtitleSpace ?? 0);
}

export function seekSonnetRearProbe(time: number) {
    clock.set(time); runtime?.renderOnce();
    return JSON.parse(document.querySelector<HTMLCanvasElement>('canvas')!.dataset.rearCurrentBounds!);
}
