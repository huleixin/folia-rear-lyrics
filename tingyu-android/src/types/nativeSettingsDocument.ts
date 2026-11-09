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
export type NativeSettingsDocument={paints:SettingsPaint[];controls:SettingsControl[];areas:SettingsScrollArea[];live:SettingsRect[];
    /**
     * 语义化设置页（原生化专项·第 21 轮）。给了它，Compose 就**不再消费** paints/controls 的矩形，
     * 改用自己的设置控件排版（TySettingsPageView）—— 于是这一页的排版真值源回到 Compose，
     * DOM 只提供"有哪些项、当前值是什么"。
     *
     * 缺省（undefined）= 维持逐元素测量的显示列表，行为与以前逐像素一致。
     * 两条路径可同时存在于不同分区，逐页迁移互不影响。
     */
    flow?:NativeSettingsFlow};
/** 语义化设置页模型。见 chrome/TySettingsModel.kt 的同名契约。 */
export type NativeSettingsFlowNode={
    id:string;
    kind:'group'|'action'|'switch'|'checkbox'|'select'|'slider'|'input'|'note'|'color'|'preview'|'image'|'reorder';
    title:string;hint?:string;value?:string;icon?:string;disabled?:boolean;detail?:string;
    min?:number;max?:number;step?:number;unit?:string;
    placeholder?:string;confirmLabel?:string;multiline?:boolean;
    inputType?:string;immediate?:boolean;
    options?:{value:string;label:string;disabled?:boolean}[];
    /** 回传动作名；缺省等于 id。 */
    action?:string;
};
export type NativeSettingsFlow={key:string;title:string;subtitle?:string;nodes:NativeSettingsFlowNode[];modal?:NativeSettingsFlow};
