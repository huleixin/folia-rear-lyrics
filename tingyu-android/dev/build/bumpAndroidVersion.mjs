import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// dev/build/bumpAndroidVersion.mjs
// One explicit bump per published Android release; ordinary builds and failed-build retries never bump it.
export function bumpAndroidVersion(directory, increment = 'patch') {
    if (!['patch', 'minor', 'major'].includes(increment)) throw Error('Use patch, minor or major');
    const pkgPath = path.join(directory, 'package.json'), lockPath = path.join(directory, 'package-lock.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')), lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version)?.slice(1).map(Number);
    if (!parts || lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version)
        throw Error('Package and lock versions must match before release');
    if (!Number.isSafeInteger(pkg.androidVersionCode) || pkg.androidVersionCode < 1 || pkg.androidVersionCode >= 2100000000)
        throw Error('Invalid Android versionCode');
    const index = { major: 0, minor: 1, patch: 2 }[increment];
    parts[index] += 1;
    for (let i = index + 1; i < parts.length; i++) parts[i] = 0;
    pkg.version = parts.join('.'); pkg.androidVersionCode += 1;
    lock.version = pkg.version; lock.packages[''].version = pkg.version;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    return { version: pkg.version, versionCode: pkg.androidVersionCode };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    console.log(JSON.stringify(bumpAndroidVersion(path.resolve(fileURLToPath(new URL('../..', import.meta.url))), process.argv[2])));
}
