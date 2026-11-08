// src/types/nativePanels.ts
// 声明式二级操作面板契约（原生化专项·第 21 轮）。
//
// 与 types/nativePages.ts 同一套哲学：**JS 出模型，Compose 出像素**。
// 面板里有哪些动作、是否可用、当前选中哪一项，全部由 React 侧既有的业务逻辑算出；
// 原生只负责绘制、命中、动画、返回与键盘。因此本文件里没有任何"业务"字段 ——
// 只有"这一段要画成什么样、点了回传什么 id"。
// 面板 id。宿主一次只呈现一张二级面板（与 WebView 侧 .ml-sheet 的单例语义一致），
// id 用于会话对账与"换了一张面板"的识别，不做多面板并行。
export type NativePanelId = string;

/** 动作行语气。danger 用危险色（删除这类不可逆操作）。 */
export type NativePanelTone = 'default' | 'danger';

/** 一行可点的动作。id 就是回传值，调用方按 id 分派到既有闭包。 */
export type NativePanelActionRow = {
    id: string;
    label: string;
    /** 第二行小字（说明/来源/曲目数）。 */
    hint?: string;
    /** res/raw/native_page_icons.json 里的图标名；不填=纯文字行。 */
    icon?: string;
    tone?: NativePanelTone;
    disabled?: boolean;
    /** 选中态（音源当前项这类）。 */
    selected?: boolean;
    /** 行尾补充信息。 */
    badge?: string;
};

export type NativePanelOption = { value: string; label: string };

/**
 * 内容块。一个面板 = 若干块顺排，块内控件同质。
 * 六种块覆盖了现有全部二级面板：动作列表 / 下拉 / 开关 / 输入 / 确认 / 说明。
 */
export type NativePanelBlock =
    | { kind: 'actions'; id: string; label?: string; items: NativePanelActionRow[] }
    | {
          kind: 'select';
          id: string;
          label: string;
          value: string;
          options: NativePanelOption[];
          disabled?: boolean;
          /** 未选中任何选项时右侧显示的占位文案（"选择歌单"这类）。 */
          placeholder?: string;
      }
    | { kind: 'toggle'; id: string; label: string; hint?: string; value: boolean; disabled?: boolean }
    | {
          kind: 'input';
          id: string;
          label?: string;
          value: string;
          placeholder?: string;
          confirmLabel: string;
          multiline?: boolean;
          tone?: NativePanelTone;
      }
    | {
          kind: 'confirm';
          id: string;
          label?: string;
          message: string;
          confirmLabel: string;
          cancelLabel?: string;
          tone?: NativePanelTone;
      }
    | { kind: 'note'; id: string; text: string; tone?: 'muted' | 'error' | 'accent' };

/** 面板模型：React 侧构造，原生与 DOM 两条渲染路径共用同一份。 */
export type NativePanelModel = {
    title: string;
    subtitle?: string;
    blocks: NativePanelBlock[];
    /** sheet（默认底部）/ dialog（居中）/ menu（贴触发元素）。 */
    kind?: 'sheet' | 'dialog' | 'menu';
    busy?: boolean;
    error?: string;
    /** 最大高度占屏比，默认 0.86；菜单不消费。 */
    heightFraction?: number;
    /** menu 的锚点（视口 CSS px）。缺省时原生退化为 sheet，绝不"什么都不显示"。 */
    anchor?: { x: number; y: number; w: number; h: number };
};

/** 推给原生的帧。 */
export type NativePanelFrame = {
    id: NativePanelId;
    session: string;
    revision: number;
    enabled: boolean;
    kind: 'sheet' | 'dialog' | 'menu';
    title: string;
    subtitle: string;
    busy: boolean;
    error: string;
    heightFraction: number;
    anchor?: { x: number; y: number; w: number; h: number };
    blocks: NativePanelBlock[];
};

/** 原生回传的面板事件。action 是命名空间字符串，见 services/nativePanels.ts 的 decode。 */
export type NativePanelEvent = {
    nativeDispatchedAt?: number;
    nativeGestureId?: number;
    id: string;
    session: string;
    key: string;
    action: string;
    text?: string;
    value?: number;
};
