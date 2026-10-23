// src/components/app/home/foliumHomePageFocus.ts
// 模组首页页面（FoliumHomePage）的焦点小工具，借自 PR #567 的实验版，改成首尾守卫：页面最前和最后各放一个能 Tab
// 到的守卫元素，页内的 Tab 顺序整个交给浏览器（slot 投影、SVG、closed ShadowRoot、iframe 里的控件都按浏览器自己的
// 序列走），只有焦点落到守卫上（Tab 即将离开页面）时才把它送到另一头。这里给出：守卫该把焦点送到哪一头、从那一头
// 起依次试着聚焦（穿透模组的 open ShadowRoot），以及穿透 ShadowRoot 的当前焦点元素。只读 DOM，不碰 React 状态。
// 另有打开页面时交不交焦点的规则（claimHomePageFocus）：不从设置、命令面板这些接管键盘的窗口里抢焦点。

/** 页面首尾守卫元素带的属性；列可聚焦元素时跳过它们。 */
export const HOME_PAGE_FOCUS_GUARD = 'data-folium-focus-guard';

export type HomePageFocusGuard = 'start' | 'end';
export type HomePageFocusEdge = 'first' | 'last';
type FocusTarget = HTMLElement | SVGElement;

/** tabIndex 是 0 却不可聚焦的元素：没有 href 的 a / area（规范给它们的 tabIndex 默认值也是 0）。 */
const UNFOCUSABLE_WITH_TAB_INDEX = 'a:not([href]), area:not([href])';

/** 渲染出来的子元素：影子宿主走它的 ShadowRoot，分到了内容的 slot 走投影进来的元素，其余走自己的子元素。 */
const renderedChildren = (element: Element): Element[] => {
    if (element.shadowRoot) return [...element.shadowRoot.children];
    if (element instanceof HTMLSlotElement) {
        const assigned = element.assignedElements({ flatten: true });
        if (assigned.length > 0) return assigned;
    }
    return [...element.children];
};

const isTabbable = (element: Element): element is FocusTarget => (element instanceof HTMLElement || element instanceof SVGElement)
    && element.tabIndex >= 0
    && !element.matches(':disabled')
    && !element.matches(UNFOCUSABLE_WITH_TAB_INDEX)
    && element.getClientRects().length > 0
    && getComputedStyle(element).visibility === 'visible';

const collectTargets = (elements: readonly Element[]): FocusTarget[] => elements.flatMap(element => {
    if (element.matches(`[inert], [hidden], [${HOME_PAGE_FOCUS_GUARD}]`)) return [];
    return [...(isTabbable(element) ? [element] : []), ...collectTargets(renderedChildren(element))];
});

/**
 * 页面里此刻大致能用 Tab 到达的元素，按渲染顺序：模组 ShadowRoot 里的元素排在宿主的位置上，slot 投影的元素排在
 * slot 的位置上。跳过守卫、inert / hidden 子树、禁用的控件、没有 href 的链接、没有布局盒子或不可见的元素。
 * 它只用来找「从哪一头起聚焦」，不决定页内的 Tab 顺序；closed ShadowRoot、iframe 里的控件看不到，
 * 那时焦点落在离那一头最近的、看得到的元素上。
 */
export const homePageFocusTargets = (root: ParentNode): FocusTarget[] => collectTargets([...root.children]);

/**
 * 焦点落到首 / 尾守卫上时该送到哪一头。从页面里出来的（Tab 越过最后一个、Shift+Tab 越过页头的返回按钮）绕回
 * 另一头；从页面外面进来的（原生首页是 inert 的，只可能是 App 别处的控件）落在离它最近的那一头，与没有守卫时一样。
 * 来源不明（relatedTarget 为 null）时：首守卫按「从外面进来」算——页面里紧挨着它的永远是页头的返回按钮；
 * 尾守卫按「从页面里出来」算——焦点从模组的 iframe 里 Tab 出来时浏览器不给 relatedTarget。
 */
export const resolveHomePageGuardEdge = (guard: HomePageFocusGuard, from: EventTarget | null, page: Node): HomePageFocusEdge => {
    const known = from instanceof Node;
    const inside = known && page.contains(from);
    if (guard === 'start') return inside ? 'last' : 'first';
    return known && !inside ? 'last' : 'first';
};

/**
 * 从页面的一头起依次试着聚焦，直到焦点真的离开守卫（focus() 没生效的元素跳过去）。返回接住焦点的元素，
 * 一个都没接住时返回 null（焦点留在守卫上，下一次 Tab 照常往前走）。
 */
export const focusHomePageEdge = (page: ParentNode, edge: HomePageFocusEdge, guard: Element): FocusTarget | null => {
    const targets = homePageFocusTargets(page);
    if (edge === 'last') targets.reverse();
    const root = guard.getRootNode() as Document | ShadowRoot;
    for (const target of targets) {
        target.focus();
        if (root.activeElement !== guard) return target;
    }
    return null;
};

/** 当前焦点元素；document.activeElement 在每一层 ShadowRoot 边界上都被改成宿主元素，这里一层层钻进去。 */
export const deepActiveElement = (): Element | null => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
};

/** 接管键盘的窗口（命令面板、设置等模态，见 utils/keyboardTargets 的 hasBlockingWindow）。 */
const KEYBOARD_WINDOW_SELECTOR = '[data-folia-keyboard-window="true"]';

/** 页面之外、此刻还算数的接管键盘的窗口：inert 子树里的（原生首页那一层里的集合对话框、bravais 的缝）被页面盖着，不算。 */
const homePageFocusBlockers = (page: Element): Element[] => [...document.querySelectorAll(KEYBOARD_WINDOW_SELECTOR)]
    .filter(element => !page.contains(element) && !element.closest('[inert]'));

/**
 * 焦点算不算「没人拿着」：落在 body（或没有），或在 inert 的子树里（打开页面时原生首页整层变 inert，焦点正随它丢掉）。
 * includePage 时焦点在页面里也算（页面打开、在几个模组页之间切换时焦点在页头上）。
 */
const isHomePageFocusFree = (page: Element, includePage: boolean): boolean => {
    const active = document.activeElement;
    if (!active || active === document.body) return true;
    if (page.contains(active)) return includePage;
    return Boolean(active.closest('[inert]'));
};

/**
 * 页面打开（或换成另一个模组页）时把焦点交给页头的当前页签（focusTarget），但不抢别人的焦点：只在焦点没人拿着（见
 * isHomePageFocusFree）、并且页面之外没有别的接管键盘的窗口时才交。设置弹窗里运行模组命令打开页面时页面在弹窗后面，
 * 抢过去的话页面拦下的 Esc 关不掉弹窗，Tab 也只在看不见的页面里转。
 * 被这样的窗口挡着时等它们关掉（DOM 里摘掉，或撤掉 data-folia-keyboard-window）再看一次：焦点那时空出来就交（命令面板
 * 里点模组命令打开页面，面板淡出之后焦点才空出来）；焦点已经被用户放到别处（包括页面里）就不再等。
 * 焦点不在窗口里、也没丢（例如搜索页的输入框）时不交也不等。返回停止等待的函数（页面卸载、换页面时调用）。
 */
export const claimHomePageFocus = (page: Element, focusTarget: () => HTMLElement | null): (() => void) => {
    // 'claimed'：交了；'wait'：被窗口挡着，等；'skip'：焦点在别处，不交也不等。
    const attempt = (includePage: boolean): 'claimed' | 'wait' | 'skip' => {
        if (homePageFocusBlockers(page).length > 0) return 'wait';
        if (!isHomePageFocusFree(page, includePage)) return 'skip';
        focusTarget()?.focus({ preventScroll: true });
        return 'claimed';
    };
    if (attempt(true) !== 'wait') return () => {};
    const observer = new MutationObserver(() => {
        if (attempt(false) !== 'wait') observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-folia-keyboard-window'] });
    return () => observer.disconnect();
};
