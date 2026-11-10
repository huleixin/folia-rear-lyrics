import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getContrastRatio } from '@/utils/themeColorMath';
import { interfaceUiTokens } from '@/services/interfaceAppearance';

const root = process.cwd();
const backgrounds = [interfaceUiTokens()['--ui-bg'], interfaceUiTokens()['--ui-sheet'], interfaceUiTokens()['--ui-surface']];
const svgDir = path.join(root, 'public/assets/tingyu-nav/light');
const icons = ['recommend', 'library', 'search', 'settings'] as const;

function svgGeometry(svg: string) {
    return [...svg.matchAll(/<(path|circle)\b([^>]*)\/?\s*>/g)].map(([, tag, attributes]) => {
        if (tag === 'path') return attributes.match(/\bd="([^"]+)"/)?.[1] ?? '';
        return ['cx', 'cy', 'r'].map(name => attributes.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1] ?? '').join(':');
    });
}

function exposedSvgColors(svg: string) {
    return [...new Set([...svg.matchAll(/(?:fill|stroke)="#([0-9a-f]{6})"/gi)].map(match => `#${match[1].toLowerCase()}`))]
        // The pale mint shapes are deliberate inlaid highlights drawn over dark icon silhouettes.
        .filter(color => color !== '#c5f0de');
}

describe('light appearance visual contracts', () => {
    it('keeps ordinary text tokens at AA contrast across page, sheet and card surfaces', () => {
        for (const foreground of [interfaceUiTokens()['--ui-ink'], interfaceUiTokens()['--ui-muted'], interfaceUiTokens()['--ui-accent']]) {
            for (const background of backgrounds) expect(getContrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('does not globally rewrite opacity utilities and gives semantic secondary settings text full opacity', () => {
        const css = fs.readFileSync(path.join(root, 'src/styles/interfaceAppearance.css'), 'utf8');
        expect(css).not.toMatch(/opacity:\s*\.82\s*!important/);
        expect(css).toMatch(/\[style\*="--text-secondary"\]\s*\{color:var\(--ui-muted,var\(--it-ordinary-muted\)\)!important;opacity:1!important\}/);
        expect(css).toContain('h1,h2,h3,h4,h5,h6,button,a)[style*="--text-secondary"]');
        expect(css).toContain('[data-folia-settings-tabs] button[class~="opacity-40"]');
        expect(css).toMatch(/:not\(\[data-folia-stage-preview\]\s*\*\)/);
    });

    it.each(icons)('%s retains its SVG geometry in all light/dark and active/inactive assets', name => {
        const variants = [
            path.join(svgDir, `${name}-active.svg`), path.join(svgDir, `${name}-inactive.svg`),
            path.join(root, 'public/assets/tingyu-nav', `${name}-active.svg`), path.join(root, 'public/assets/tingyu-nav', `${name}-inactive.svg`),
        ].map(file => fs.readFileSync(file, 'utf8'));
        expect(variants.every(svg => svgGeometry(svg).length > 0)).toBe(true);
        expect(new Set(variants.map(svg => JSON.stringify(svgGeometry(svg)))).size).toBe(1);
    });

    it.each(icons)('%s light active and inactive colors remain legible without losing their two-tone asset', name => {
        for (const active of [true, false]) {
            const svg = fs.readFileSync(path.join(svgDir, `${name}-${active ? 'active' : 'inactive'}.svg`), 'utf8');
            expect(svg).toContain('viewBox="0 0 24 24"');
            const colors = exposedSvgColors(svg);
            expect(colors.length).toBeGreaterThanOrEqual(2);
            for (const color of colors) for (const background of backgrounds)
                expect(getContrastRatio(color, background), `${name} ${active ? 'active' : 'inactive'} ${color} on ${background}`).toBeGreaterThanOrEqual(3);
        }
    });

    it('keeps light modal surfaces readable over saturated art and leaves dark glass literals unchanged', () => {
        const modalCss = fs.readFileSync(path.join(root, 'src/theme/interfaceThemeSpec.json'), 'utf8');
        const queueCss = fs.readFileSync(path.join(root, 'src/components/app/player-panel/mobileQueueSheet.css'), 'utf8');
        expect(modalCss).toContain('rgba(241,244,237,.97)');
        expect(queueCss).toContain('rgba(244,247,241,.97)');
        expect(modalCss).toContain('rgba(14,35,25,.10)');
        const canvas = (background: string, foreground: string, alpha: number) => {
            const b = background.match(/[0-9a-f]{2}/gi)!.map(value => parseInt(value, 16));
            const f = foreground.match(/[0-9a-f]{2}/gi)!.map(value => parseInt(value, 16));
            return `#${b.map((value, index) => Math.round(f[index] * alpha + value * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
        };
        expect(getContrastRatio('#213e34', canvas('#db54aa', '#f1f4ed', .97))).toBeGreaterThanOrEqual(4.5);
        const material = fs.readFileSync(path.join(root, 'android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeMaterial.kt'), 'utf8');
        expect(material).toContain('spec.interfaceMaterial(palette.style)');
        expect(material).toContain('palette.glassFallback');
    });
});
