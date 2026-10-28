import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// dev/build/buildPlaybackTest.mjs
// Explicit opt-in for BOTH web assets and the Android build. The ordinary APK stays stable.
process.chdir(fileURLToPath(new URL('../..', import.meta.url)));
const env = { ...process.env, VITE_TINGYU_PLAYBACK_TEST: 'true' };
for (const [bin, args] of [['npm', ['run', 'build:capacitor']], ['npx', ['cap', 'copy', 'android']]]) {
    const result = spawnSync(process.platform === 'win32' ? `${bin}.cmd` : bin, args,
        { env, stdio: 'inherit', shell: process.platform === 'win32' });
    if (result.status !== 0) process.exit(result.status ?? 1);
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
writeFileSync('android/app/src/main/assets/public/tingyu-playback-test.json', JSON.stringify({
    packageName: 'io.github.huleixin.tingyu.playbacktest', version: `${pkg.version}-playback-test.1`,
    defaultEngine: 'web', testBuild: true,
}, null, 2));
console.log('Test assets ready. Build Android with -PtingyuPlaybackTest=true.');
