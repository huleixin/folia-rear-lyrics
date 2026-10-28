// src/utils/nativeSettingsMutations.ts
const motionOnly = new Set(['transform', 'translate', 'rotate', 'scale', 'will-change']);
let scratch: [CSSStyleDeclaration, CSSStyleDeclaration] | undefined;
/** Ignore compositor-only motion, but retain layout, colour, value and visibility edits. */
export function isVisualOnlyStyleMutation(before: string | null, after: string | null): boolean {
    scratch ??= [document.createElement('span').style, document.createElement('span').style];
    const [left, right] = scratch;
    left.cssText = before ?? ''; right.cssText = after ?? '';
    const properties = new Set([...Array.from(left), ...Array.from(right)]);
    return [...properties].every(key => {
        if (left.getPropertyValue(key) === right.getPropertyValue(key) && left.getPropertyPriority(key) === right.getPropertyPriority(key)) return true;
        if (motionOnly.has(key)) return true;
        // Intermediate fades do not change the captured form; reaching zero does.
        return key === 'opacity' && Number(left.opacity || 1) > 0 && Number(right.opacity || 1) > 0;
    });
}
