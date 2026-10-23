// src/utils/appSurface.ts
// Which root this window mounts, decided once from the URL. bootstrap.tsx picks the React root with
// it; features that only make sense in the main app window (the video layer, mod clients) read the
// same answer instead of re-parsing the URL.

const searchParams = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);

export const isObsBrowserSourceSurface = false;

export const obsSourceKind = searchParams.get('obsSource');

export const isRemoteControlSurface = false;

export const isRearLyricsSurface = typeof window !== 'undefined' && window.location.pathname === '/rear-lyrics.html';

export const isMainAppSurface = typeof window !== 'undefined' && !isObsBrowserSourceSurface && !isRemoteControlSurface && !isRearLyricsSurface;
