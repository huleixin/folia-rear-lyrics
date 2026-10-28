// src/types/nativePages.ts
// Presentation-only contract. Provider objects, credentials and playback engines stay in JS.
import type { NativeSettingsDocument } from './nativeSettingsDocument';
export type NativePageId = 'home' | 'collection' | 'search' | 'settings';
export type PageEvent = { text?: string; value?: number };
export type PageActions = Record<string, (event: PageEvent) => void>;
export type PageItem = {
    id: string; title: string; subtitle?: string; image?: string; action?: string;
    secondary?: string; secondaryLabel?: string; disabled?: boolean; selected?: boolean;
    number?: string; duration?: string;
};
export type PageSection = {
    id: string; title?: string; layout: 'rows' | 'cards' | 'hero' | 'chips' | 'input' | 'message';
    items?: PageItem[]; text?: string; value?: string; placeholder?: string; action?: string;
    submit?: string; more?: string; moreLabel?: string; busy?: boolean;
    total?: number; offset?: number; request?: string; key?: string; image?: string;
    description?: string; creator?: string; creatorImage?: string;
};
export type NativePageModel = {
    key: string; title: string; subtitle?: string; leading?: string; trailing?: string;
    trailingLabel?: string; background?: 'home' | 'dark'; sections: PageSection[];
    bottomClearance?: number; topPadding?: number;
    document?:NativeSettingsDocument;
};
export type NativePageFrame = {
    id: NativePageId; session: string; generation: number; revision: number; enabled: boolean;
    left: number; top: number; width: number; height: number; viewportWidth: number;
    safeTop: number; safeBottom: number; model: NativePageModel;
    navigation?: string;
};
export type NativePageEvent = { id: NativePageId; session: string; key: string; action: string; text?: string; value?: number };
