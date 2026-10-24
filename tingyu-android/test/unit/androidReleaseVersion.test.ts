import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { bumpAndroidVersion } from '../../dev/build/bumpAndroidVersion.mjs';

// test/unit/androidReleaseVersion.test.ts
// Releases must upgrade both Android's installer code and every package source of the displayed version.
it('increments release versions without changing dependency resolution', () => {
    const root=mkdtempSync(path.join(tmpdir(),'tingyu-version-'));
    try {
        writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'1.2.2',androidVersionCode:5}));
        writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({version:'1.2.2',packages:{'':{version:'1.2.2'},'node_modules/example':{version:'9.0.0',integrity:'unchanged'}}}));
        expect(bumpAndroidVersion(root)).toEqual({version:'1.2.3',versionCode:6});
        expect(bumpAndroidVersion(root)).toEqual({version:'1.2.4',versionCode:7});
        expect(bumpAndroidVersion(root,'minor')).toEqual({version:'1.3.0',versionCode:8});
        const lock=JSON.parse(readFileSync(path.join(root,'package-lock.json'),'utf8'));
        expect(lock.packages[''].version).toBe('1.3.0'); expect(lock.packages['node_modules/example'].integrity).toBe('unchanged');
        lock.version='1.0.0';writeFileSync(path.join(root,'package-lock.json'),JSON.stringify(lock));
        expect(()=>bumpAndroidVersion(root)).toThrow('must match');
        expect(JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version).toBe('1.3.0');
    } finally { rmSync(root,{recursive:true,force:true}); }
});
it('builds native and WebView version labels from the same package metadata', () => {
    const pkg=JSON.parse(readFileSync('package.json','utf8'));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/); expect(pkg.androidVersionCode).toBeGreaterThan(5);
    expect(JSON.parse(readFileSync('package-lock.json','utf8')).version).toBe(pkg.version);
    expect(readFileSync('android/app/build.gradle','utf8')).toContain('packageJson.androidVersionCode as int');
    expect(readFileSync('src/components/modal/SettingsModal.tsx','utf8')).not.toContain('Tingyu 1.0.0');
});
