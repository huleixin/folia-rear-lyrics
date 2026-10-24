import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// test/unit/library/suiteEntries.test.ts
const root=path.resolve(__dirname,'../../..');
const read=(rel:string)=>readFileSync(path.join(root,rel),'utf8');
describe('Tingyu suite entry boundaries',()=>{
    it('ships only the mobile renderer entry',()=>{const dir=path.join(root,'src/library/suites');const entries=readdirSync(dir).filter(id=>existsSync(path.join(dir,id,'entry.ts')));expect(entries).toEqual(['mobile']);});
    it('keeps surfaces split while allowing idle collection preloading',()=>{
        const entry=read('src/library/suites/mobile/entry.ts');
        expect(entry.match(/React\.lazy\(/g)).toHaveLength(4);
        expect(entry).toContain('component: mobileCollectionLoader.Component');
        expect(entry).not.toMatch(/from ['"]\.\/MobileCollection['"]/);
        expect(read('src/library/suites/mobile/mobileCollectionPreload.ts')).toContain("import('./MobileCollection')");
    });
    it('keeps the migrated login implementation available',()=>{expect(existsSync(path.join(root,'src/library/suites/mobile/account/GridAccountSurface.tsx'))).toBe(true);expect(read('src/library/suites/mobile/entry.ts')).toContain("'account-backend-restart'");});
});
