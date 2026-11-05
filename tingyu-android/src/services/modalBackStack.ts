// src/services/modalBackStack.ts
//
// 模态弹窗的返回优先级栈。
//
// 背景（68599 / 68600）：洛雪自定义音源是独立 React 全局弹窗，硬件返回被设置页的
// Escape 处理器先一步拦下（它调用 preventDefault + stopImmediatePropagation），
// 于是"返回"只退掉了底层设置，弹窗留在资料库首页上成了孤儿。
//
// 这里不再依赖事件冒泡顺序：谁最后打开谁在最上层，返回时先问栈顶。
//   · 栈顶存在 → 由它消费本次返回（正在导入时可以"消费但不关"，保持原有锁定逻辑）；
//   · 栈空    → 交回原来的 Escape 分发逻辑，行为与之前完全一致。
//
// 只注册真正需要"返回即关闭"的模态（ThemedDialog 这一层），不新增除它之外的监听，
// 避免一次返回关掉多层页面。

type ModalBackEntry = { id: number; onBack: () => void };

let sequence = 0;
const stack: ModalBackEntry[] = [];

/** 注册一个模态返回处理器；返回注销函数（组件卸载时调用）。 */
export function registerModalBack(onBack: () => void): () => void {
    const id = ++sequence;
    stack.push({ id, onBack });
    return () => {
        const index = stack.findIndex(entry => entry.id === id);
        if (index >= 0) stack.splice(index, 1);
    };
}

/** 是否还有打开的模态（用于让底层页面放弃处理返回）。 */
export function hasRegisteredModal(): boolean {
    return stack.length > 0;
}

/**
 * 让栈顶模态消费一次返回。
 * 返回 true 表示"这次返回已经有主"，调用方不要再关闭底层页面 / 交给浏览器。
 * 栈顶处理器自身可以拒绝关闭（例如导入进行中），此时仍然算消费，页面不会后退。
 */
export function runTopModalBack(): boolean {
    const top = stack[stack.length - 1];
    if (!top) return false;
    try { top.onBack(); } catch { /* 一个坏处理器不能吞掉用户的返回键。 */ }
    return true;
}

/** 测试用。 */
export function resetModalBackStack(): void {
    stack.length = 0;
}
