import { useEffect, useMemo, useRef } from 'react';
import type { Theme } from '@/types';
import type { FoliumPanelContext } from '../contract';
import { toFoliumTheme } from '../dto';

// src/mods/folium/registries/useFoliumPanelContext.ts
// Theme and locale context shared by owned panel tabs and full home pages.

export const useFoliumPanelContext = (theme: Theme, isDaylight: boolean, locale: string): FoliumPanelContext => {
    const themeRef = useRef({ theme, isDaylight });
    themeRef.current = { theme, isDaylight };
    const listenersRef = useRef(new Set<() => void>());
    const ctx = useMemo<FoliumPanelContext>(() => Object.freeze({
        locale,
        getTheme: () => toFoliumTheme(themeRef.current.theme, themeRef.current.isDaylight),
        subscribe: (listener: () => void) => {
            listenersRef.current.add(listener);
            return () => listenersRef.current.delete(listener);
        },
    }), [locale]);
    const primedRef = useRef(false);
    useEffect(() => {
        if (!primedRef.current) {
            primedRef.current = true;
            return;
        }
        listenersRef.current.forEach(listener => listener());
    }, [theme, isDaylight]);
    return ctx;
};
