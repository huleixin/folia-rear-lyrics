import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { frameScopeKind, rewriteVisualizerFrames, visualizerFrameScopePlugin } from '../../dev/build/visualizerFrameScopePlugin.mjs';

// test/unit/visualizerFrameScopePlugin.test.ts
// Check actual installed driver syntax, and exclude the UI from the graphics-only build transform.
it('rewrites only global graphics frame calls, preserving comments, strings and UI modules',()=>{
    const code='// requestAnimationFrame(keep this comment)\nconst label="requestAnimationFrame(string)";\nconst el=<div/>;const n=window.requestAnimationFrame(tick);cancelAnimationFrame(n);';
    const changed=rewriteVisualizerFrames(code,'C:/app/src/components/visualizer/backgrounds/example.tsx');
    if(!changed)throw Error('Graphics calls were not scoped');
    expect(changed.code).toContain('requestVisualizerBackgroundFrame as');
    expect(changed.requests).toBe(1);expect(changed.cancels).toBe(1);
    expect(changed.code).toContain('// requestAnimationFrame(keep this comment)');expect(changed.code).toContain('"requestAnimationFrame(string)"');
    expect(changed.code).toContain('__tingyuVisualRequest(tick)');expect(changed.map.sourcesContent?.[0]).toBe(code);
    for(const id of ['src/library/suites/mobile/MobileMiniPlayer.tsx','node_modules/framer-motion/dist/es/frameloop/index.mjs','src/hooks/useLiquidGlass.ts'])
        expect(rewriteVisualizerFrames(code,'C:/app/'+id)).toBeNull();
});
it('recognizes and transforms the locked Paper, Pixi and R3F drivers',()=>{
    const cases=[['paper','node_modules/@paper-design/shaders/dist/shader-mount.js'],['pixi','node_modules/pixi.js/lib/ticker/Ticker.mjs'],['r3f','node_modules/@react-three/fiber/dist/events-9ce18a08.esm.js']];
    for(const [kind,file] of cases){
        const id=path.resolve(file);expect(frameScopeKind(id)).toBe(kind);
        const result=rewriteVisualizerFrames(readFileSync(file,'utf8'),id);
        if(!result)throw Error('Graphics driver was not scoped: '+file);
        expect(result.code).toContain(kind==='paper'?'requestVisualizerBackgroundFrame as':'requestVisualizerAnimationFrame as');
        expect(result.requests).toBeGreaterThan(0);expect(result.cancels).toBeGreaterThan(0);
    }
});

it('normalizes the Windows runtime ID and rejects duplicate scheduler instances at build time',()=>{
    const plugin=visualizerFrameScopePlugin(process.cwd());
    const id=plugin.resolveId('virtual:tingyu-visual-frames');
    if(!id)throw Error('Frame runtime was not resolved');
    expect(id).not.toContain('\\');expect(id).toMatch(/src\/utils\/visualizerFrameChannel\.ts$/);
    const context={getModuleIds:()=>[id,id.replaceAll('/','\\')],error:(message:string)=>{throw Error(message);},emitFile:()=>{}};
    expect(()=>plugin.generateBundle.call(context)).toThrow('Expected one configured visual frame module, found 2');
});
