// src/types/nativeSettingsDocument.ts
// Layout only: never persisted. Existing React settings remain the action/state owner.
export type SettingsRect={x:number;y:number;w:number;h:number};
export type SettingsPaint=SettingsRect&{kind:'box'|'text'|'svg'|'image'|'live';color?:string;background?:string;gradient?:string;border?:string;borderWidth?:number;
    radius?:number;opacity?:number;text?:string;font?:number;weight?:number;family?:string;italic?:boolean;lineHeight?:number;image?:string;
    svg?:string;area?:string;clip?:SettingsRect;edges?:{width:number;color:string}[]};
export type SettingsControl=SettingsRect&{id:string;kind:'click'|'text'|'range'|'select'|'ruler'|'pad';value?:string;label:string;disabled:boolean;area?:string;
    min?:number;max?:number;step?:number;inputType?:string;options?:{value:string;label:string}[];font?:number;color?:string;multiline?:boolean;
    placeholder?:string;padding?:number[];accent?:string;rangeFill?:boolean};
export type SettingsScrollArea=SettingsRect&{id:string;contentHeight:number;offset:number};
export type NativeSettingsDocument={paints:SettingsPaint[];controls:SettingsControl[];areas:SettingsScrollArea[];live:SettingsRect[]};
