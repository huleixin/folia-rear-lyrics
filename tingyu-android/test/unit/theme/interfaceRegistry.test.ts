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
        postcss.parse(css).walkDecls(d=>{declarations.push(d.prop+':'+d.value+(d.important?'!important':''));});
        expect(crypto.createHash('sha256').update(JSON.stringify(declarations)).digest('hex')).toBe(expected);
    });
    it('keeps generated native, CSS and startup outputs current',async()=>{
        const {execFileSync}=await import('node:child_process');
        expect(()=>execFileSync(process.execPath,['dev/build/generateInterfaceThemes.mjs','--check'])).not.toThrow();
    });
});
