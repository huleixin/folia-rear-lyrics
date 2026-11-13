import fs from 'node:fs';
import crypto from 'node:crypto';
import postcss from 'postcss';
import {describe,it,expect} from 'vitest';
import {interfaceThemes,resolveInterfaceTheme} from '@/theme/interfaceThemes.generated';
import baseline from './fixtures/classicCssBaseline.json';

// test/unit/theme/interfaceRegistry.test.ts
// Fingerprints were captured from commit 550bdf9, before migrating any CSS colors.
describe('shared ordinary theme registry',()=>{
    it.each([null,undefined,'','invalid','__proto__','constructor'])('falls back safely for %s',value=>{
        expect(resolveInterfaceTheme(value)).toBe('classic');
    });
    it.each(Object.entries(baseline))('preserves every classic declaration in %s',(file,expected)=>{
        let css=fs.readFileSync(file,'utf8');
        for(const [key,value] of Object.entries(interfaceThemes.classic.dark.web))
            css=css.replaceAll('var('+key+')',value);
        const declarations:string[]=[];
        // Six motion declarations were added after the color baseline by the native transition pass.
        const motionTokens:Record<string,string> = {
            '--ty-duration-player-morph':'520ms', '--ty-duration-cover':'480ms', '--ty-duration-theme':'320ms',
            '--ty-duration-panel-exit':'190ms', '--ty-duration-popup-exit':'160ms', '--ty-ease-emphasized':'cubic-bezier(.16, 1, .3, 1)',
        };
        postcss.parse(css).walkDecls(d=>{
            // The compact catalog badge intentionally adds its own presentation declarations.
            // The fingerprint protects the existing ordinary-theme declarations from drift.
            if (file.endsWith('mobileLibrary.css') && d.parent?.type === 'rule'
                && String((d.parent as postcss.Rule).selector).split(',').some(selector => selector.trim().startsWith('.ml-audio-spec'))) return;
            if (file.endsWith('tingyuTokens.css') && d.prop in motionTokens) expect(d.value).toBe(motionTokens[d.prop]);
            else declarations.push(d.prop+':'+d.value+(d.important?'!important':''));
        });
        expect(crypto.createHash('sha256').update(JSON.stringify(declarations)).digest('hex')).toBe(expected);
    });
    it('keeps generated native, CSS and startup outputs current',async()=>{
        const {execFileSync}=await import('node:child_process');
        expect(()=>execFileSync(process.execPath,['dev/build/generateInterfaceThemes.mjs','--check'])).not.toThrow();
    });
});
