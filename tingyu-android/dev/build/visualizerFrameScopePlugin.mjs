import path from 'node:path';
import { parseAst } from 'vite';
import MagicString from 'magic-string';

// dev/build/visualizerFrameScopePlugin.mjs
// Route graphics drivers into an explicit queue, without changing vendor files or the browser's UI RAF.
const virtualId = 'virtual:tingyu-visual-frames';
export function frameScopeKind(id) {
    const file = id.replaceAll('\\', '/').split('?')[0];
    if (file.includes('/src/components/visualizer/') && /\.[cm]?[jt]sx?$/.test(file)) return 'visualizer';
    if (file.endsWith('/@paper-design/shaders/dist/shader-mount.js')) return 'paper';
    if (file.endsWith('/pixi.js/lib/ticker/Ticker.mjs')) return 'pixi';
    if (/\/@react-three\/fiber\/dist\/events-[^/]+\.esm\.js$/.test(file)) return 'r3f';
    return null;
}
export function rewriteVisualizerFrames(code, id) {
    const kind = frameScopeKind(id);
    if (!kind || !/\b(?:request|cancel)AnimationFrame\s*\(/.test(code)) return null;
    const source = parseAst(code, { lang: id.endsWith('.tsx') ? 'tsx' : 'ts' });
    const result = new MagicString(code); let requests = 0, cancels = 0;
    const visit = node => {
        if (node.type === 'CallExpression') {
            const expr = node.callee;
            const name = expr.type === 'Identifier' ? expr.name
                : expr.type === 'MemberExpression' && !expr.computed && expr.object.type === 'Identifier'
                    && ['window', 'globalThis'].includes(expr.object.name) ? expr.property.name : '';
            if (name === 'requestAnimationFrame' || name === 'cancelAnimationFrame') {
                result.overwrite(expr.start, expr.end, name === 'requestAnimationFrame' ? '__tingyuVisualRequest' : '__tingyuVisualCancel');
                if (name === 'requestAnimationFrame') requests++; else cancels++;
            }
        }
        for (const [key, value] of Object.entries(node)) {
            if (['comments', 'tokens', 'loc'].includes(key)) continue;
            if (Array.isArray(value)) value.forEach(child => { if (child && typeof child.type === 'string') visit(child); });
            else if (value && typeof value.type === 'string') visit(value);
        }
    };
    visit(source);
    if (!requests && !cancels) return null;
    result.prepend(`import { requestVisualizerAnimationFrame as __tingyuVisualRequest, cancelVisualizerAnimationFrame as __tingyuVisualCancel } from '${virtualId}';\n`);
    return { code: result.toString(), map: result.generateMap({ hires: true, source: id, includeContent: true }), kind, requests, cancels };
}
export function visualizerFrameScopePlugin(root) {
    const stats = [];
    return {
        name: 'tingyu-visualizer-frame-scope', enforce: 'pre', apply: 'build',
        resolveId(id) { if (id === virtualId) return path.resolve(root, 'src/utils/visualizerFrameChannel.ts'); },
        transform(code, id) {
            const output = rewriteVisualizerFrames(code, id);
            if (!output) return null;
            const normalized = id.replaceAll('\\', '/');
            const file = normalized.includes('/node_modules/') ? normalized.slice(normalized.lastIndexOf('/node_modules/')+1)
                : normalized.replace(root.replaceAll('\\', '/')+'/', '');
            stats.push({ file, kind: output.kind, requests: output.requests, cancels: output.cancels });
            return { code: output.code, map: output.map };
        },
        generateBundle() {
            for (const kind of ['paper', 'pixi', 'r3f']) if (!stats.some(entry => entry.kind === kind))
                this.error(`Missing graphics RAF scope for ${kind}; check locked dependency paths before release.`);
            this.emitFile({ type: 'asset', fileName: 'visualizer-frame-scope.json', source: JSON.stringify(stats, null, 2) });
        },
    };
}
