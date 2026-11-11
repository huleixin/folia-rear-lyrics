import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// dev/build/buildMotionTest.mjs
// Fresh ordinary web assets + separate Android package; no playback diagnostic flags.
const root = fileURLToPath(new URL('../..', import.meta.url));
const windows = process.platform === 'win32';
const env = { ...process.env, VITE_TINGYU_PLAYBACK_TEST: 'false' };
for (const [command, args, cwd] of [
    [windows ? 'npm.cmd' : 'npm', ['run', 'cap:sync:android'], root],
    [windows ? 'gradlew.bat' : './gradlew', [':app:assembleRelease', '-PtingyuMotionTest=true', '--console=plain'], fileURLToPath(new URL('../../android', import.meta.url))],
]) {
    const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: windows });
    if (result.error) console.error(result.error.message);
    if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Motion APK: android/app/build/outputs/apk/release/app-release.apk');
