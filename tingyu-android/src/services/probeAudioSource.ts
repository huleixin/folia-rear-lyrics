// src/services/probeAudioSource.ts
// Load metadata on a silent temporary element before replacing the live source.
export function probeAudioSource(url: string, isCurrent: () => boolean): Promise<void> {
    return new Promise((resolve, reject) => {
        const audio = new Audio();
        const cleanup = () => { clearTimeout(timer); audio.onloadedmetadata = null; audio.onerror = null; audio.removeAttribute('src'); audio.load(); };
        const timer = setTimeout(() => { cleanup(); reject(new Error('Audio source timed out')); }, 12000);
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => { cleanup(); isCurrent() ? resolve() : reject(new Error('Stale quality switch')); };
        audio.onerror = () => { cleanup(); reject(new Error('Cannot decode requested quality')); };
        audio.src = url; audio.load();
    });
}
