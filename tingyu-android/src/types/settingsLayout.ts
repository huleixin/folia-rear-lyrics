// src/types/settingsLayout.ts
// Explicit page structure. Dimensions are design tokens, never measured browser rectangles.
export type SettingsLayoutStyle = {
    gap?: number; padding?: number[]; margin?: number[]; radius?: number;
    columns?: number; wideColumns?: number; breakpoint?: number;
    width?: number; height?: number; minHeight?: number; aspect?: number; grow?: boolean;
    align?: 'start'|'center'|'end'|'between'; font?: number; weight?: number;
    tone?: 'text'|'muted'|'accent'|'danger'; border?: boolean; fill?: boolean;
    center?: boolean; divider?: boolean; preview?: 'stage'|'theme'|'offset';
    overlay?: string; progress?: number; stackBelow?: number; maxHeight?: number; scroll?: boolean; reverse?: boolean;
};
export type SettingsLayoutNode = {
    id: string; kind: 'column'|'row'|'wrap'|'grid'|'card'|'segment'|'text'|'icon'|'control'|'spacer'|'break'|'vector';
    style?: SettingsLayoutStyle; ref?: string; text?: string; icon?: string; svg?: string;
    children?: SettingsLayoutNode[];
};
