import { motionValue } from 'framer-motion';
import { TemperaPixiRuntime } from '../src/components/visualizer/tempera/createTemperaPixiRuntime';
import { compileTemperaProgram } from '../src/components/visualizer/tempera/temperaProgram';
import { TEMPERA_SHOT_KINDS, type TemperaShotKind } from '../src/components/visualizer/tempera/types';
import { DEFAULT_TEMPERA_TUNING, type Line } from '../src/types';
import { FALLBACK_AI_DUAL_THEME } from '../src/services/themeSanitizer';

// dev/temperaRearProbe.ts
// The actual director, all composition templates, and optional ink-only output for pixel bounds QA.
export const temperaRearKinds = TEMPERA_SHOT_KINDS;
const clock = motionValue(0);
let runtime: TemperaPixiRuntime | null = null;
export async function mountTemperaRearProbe(options: {
    kind: TemperaShotKind; fontScale?: number; distortion?: number; post?: boolean;
    inkOnly?: boolean; whole?: boolean; subtitleSpace?: number; colored?: boolean;
    compression?: boolean; inversion?: boolean; staticMode?: boolean;
}) {
    runtime?.destroy(); runtime = null;
    document.documentElement.dataset.foliaSurface = 'rear-lyrics-panel';
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0';
    document.body.style.cssText = 'margin:0;background:#101614'; document.body.replaceChildren(host);
    const texts = ['渐渐地忘记 忘记了时间','我只要沿着记忆的路线','Send them your heart so they will know someone cares'];
    const lines: Line[] = texts.map((fullText,i) => ({fullText,startTime:i*10,endTime:i*10+8,
        words:[...fullText].map((text,j,a)=>({text,startTime:i*10+j*8/a.length,endTime:i*10+(j+1)*8/a.length}))}));
    const program = compileTemperaProgram(lines,`rear-probe-${options.kind}`,{wholeLineLyrics:options.whole ?? true});
    for (const paragraph of program.paragraphs) for (const shot of paragraph.shots) shot.kind = options.kind;
    const tuning = { ...DEFAULT_TEMPERA_TUNING, cameraIntensity: 1.7, glyphMotion: 1.6,
        postProcessEnabled: options.post ?? false, postProcessLensDistortion: options.distortion ?? .3,
        postProcessGrain: 0, postProcessRgbShift: options.post ? 1 : 0, postProcessVignette: 0,
        postProcessTextureCompression: options.compression ?? false,
        textInversion: options.inversion ?? !options.inkOnly,
        ...(options.inkOnly ? {showBlocks:false,showDecor:false,showCornerMarks:false,enableTransitions:false} : {}) };
    clock.set(2);
    runtime = await TemperaPixiRuntime.create({host,program,songSeed:'tempera-rear-probe',tuning,
        theme:{...FALLBACK_AI_DUAL_THEME.dark,primaryColor:'#ffffff',accentColor:'#ffffff',
            ...(options.colored ? {wordColors:[{word:'时间',color:'#ff55bb'}]} : {})},
        currentTime:clock,lyricsFontScale:options.fontScale ?? 1,staticMode:options.staticMode ?? false,paused:true});
    runtime.setSubtitleSpace(options.subtitleSpace ?? 0);
}
export function seekTemperaRearProbe(time:number) {
    clock.set(time);runtime?.renderOnce();
    return JSON.parse(document.querySelector<HTMLCanvasElement>('canvas')!.dataset.rearCurrentBounds!);
}

// Read back a rendered frame with/without reading ink. Artwork and the inversion shader stay
// unchanged, so browser QA can detect vanishing or misplaced type over every real composition.
export function captureTemperaRearProbe(time: number) {
    const report = seekTemperaRearProbe(time);
    const internals = runtime as unknown as {
        app: import('pixi.js').Application;
        sceneCache: {forEach: (fn:(scene:import('../src/components/visualizer/tempera/temperaSceneBuilder').TemperaSceneView)=>void)=>void};
    };
    const canvas = internals.app.canvas;
    const read = () => {
        const buffer = document.createElement('canvas'); buffer.width=canvas.width; buffer.height=canvas.height;
        const context=buffer.getContext('2d')!; context.drawImage(canvas,0,0);
        return context.getImageData(0,0,buffer.width,buffer.height).data;
    };
    const withInk = read(), visibility = new Map<import('pixi.js').Container,boolean>();
    internals.sceneCache.forEach(scene => {for(const shot of scene.shots) for(const glyph of shot.glyphs)
        for(const node of [glyph.display,glyph.shadow,...glyph.echoes]) if(node) {visibility.set(node,node.visible);node.visible=false;}
    });
    internals.app.renderer.render(internals.app.stage); const withoutInk=read();
    visibility.forEach((visible,node)=>{node.visible=visible;});runtime?.renderOnce();
    let changed=0, left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++) {
        const offset=(y*canvas.width+x)*4;
        if(Math.max(...[0,1,2,3].map(c=>Math.abs(withInk[offset+c]-withoutInk[offset+c])))<24)continue;
        changed++;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
    }
    const sx=innerWidth/canvas.width,sy=innerHeight/canvas.height;
    return {...report,changed,pixelBounds:changed?{left:left*sx,top:top*sy,width:(right-left)*sx,height:(bottom-top)*sy}:null};
}
