import { useEffect, useRef, type RefObject } from 'react';

type GlassOptions = {
    refraction?: number;
    bezel?: number;
    curvature?: number;
    chroma?: number;
    specular?: number;
    specularWidth?: number;
    mapScale?: number;
    blur?: number;
};

const DEFAULT_OPTIONS: GlassOptions = {
    refraction: 11,
    bezel: 0.24,
    curvature: 3,
    // Backdrop captures include transparent boundary pixels. The vendor's three-channel
    // arithmetic recombination sums alpha as well as RGB, darkening those pixels.
    chroma: 0,
    blur: 5,
    specular: 0.24,
    specularWidth: 0.8,
    mapScale: 1,
};

/** Initializes the vendored optical backdrop lens once per mounted surface. */
export function useLiquidGlass<T extends HTMLElement>(activationKey?: string | boolean, options = DEFAULT_OPTIONS) {
    const ref = useRef<T>(null);
    useLiquidGlassOnRef(ref, activationKey, options);
    return ref;
}

export function useLiquidGlassOnRef<T extends HTMLElement>(
    ref: RefObject<T | null>,
    activationKey?: string | boolean,
    options = DEFAULT_OPTIONS,
) {
    useEffect(() => {
        const target = ref.current;
        if (!target) return;

        let disposed = false;
        let destroy: (() => void) | undefined;

        void import('../vendor/liquid-glass/liquid-glass.js')
            .then(({ createGlass, engine }) => {
                if (disposed) return;
                const supportsOpticalBackdrop =
                    engine === 'blink' &&
                    typeof CSS !== 'undefined' &&
                    CSS.supports('backdrop-filter', 'url(#liquid-glass-feature-check)');
                if (engine === 'blink' && !supportsOpticalBackdrop) {
                    target.style.backdropFilter = 'blur(10px) saturate(1.25)';
                    target.style.setProperty('-webkit-backdrop-filter', 'blur(10px) saturate(1.25)');
                    target.dataset.glassEngine = 'fallback-blur';
                    destroy = () => {
                        target.style.backdropFilter = '';
                        target.style.removeProperty('-webkit-backdrop-filter');
                    };
                    return;
                }
                const glass = createGlass(target, {
                    ...options,
                    mode: 'backdrop',
                    fit: true,
                    radius: Number.parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0,
                    clip: true,
                    fallback: 'blur(10px) saturate(1.25)',
                });
                destroy = () => glass.destroy();
                target.dataset.glassEngine = supportsOpticalBackdrop ? 'backdrop-refraction' : 'fallback-blur';
            })
            .catch((error: unknown) => {
                if (!disposed) {
                    target.dataset.glassEngine = 'fallback-blur';
                    console.warn('[LiquidGlass] Optical engine could not initialize; retaining CSS fallback.', error);
                }
            });

        return () => {
            disposed = true;
            destroy?.();
            delete target.dataset.glassEngine;
        };
    // Glass geometry is static; activationKey is used only when a selected-tab lens changes target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activationKey]);

}
