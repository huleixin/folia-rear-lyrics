// src/utils/graphicsDiagnosticsBuild.ts
// Explicit build opt-in; normal APKs never install markers, samplers or observers.
export const GRAPHICS_DIAGNOSTICS=import.meta.env.VITE_TINGYU_GRAPHICS_DIAGNOSTICS==='true';
export const GRAPHICS_MODES=['A','B','C31','C_HW'] as const;
export type GraphicsMode=typeof GRAPHICS_MODES[number];
export const canChangeGraphicsMode=(from:GraphicsMode,to:GraphicsMode)=>from==='A'||to==='A'||from===to;
