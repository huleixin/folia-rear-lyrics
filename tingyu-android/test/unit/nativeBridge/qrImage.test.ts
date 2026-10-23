import { describe, expect, it } from 'vitest';
import { buildQrDataUrl, buildQrSvg } from '../../../src/nativeBridge/api/qrImage.js';

// The QR image used to come from api.qrserver.com; one network policy against that host broke the
// QR for every platform that relied on it. These tests decode the SVG we now render ourselves and
// check it really is a QR symbol, so a wrong matrix (bad quiet zone, transposed rows, a broken
// run-length path) fails here instead of in a user's scan.

type Grid = { side: number; dark: boolean[][] };

const parseSvg = (svg: string): Grid => {
    const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    if (!viewBox) throw new Error('no viewBox');
    const side = Number(viewBox[1]);
    if (Number(viewBox[2]) !== side) throw new Error('not square');
    const dark = Array.from({ length: side }, () => new Array<boolean>(side).fill(false));
    const path = / d="([^"]*)"/.exec(svg);
    if (!path) throw new Error('no path');
    const runPattern = /M(\d+) (\d+)h(\d+)v1h-\d+z/g;
    let matches = 0;
    for (const match of path[1]!.matchAll(runPattern)) {
        matches += 1;
        const column = Number(match[1]);
        const row = Number(match[2]);
        const length = Number(match[3]);
        for (let index = 0; index < length; index += 1) dark[row]![column + index] = true;
    }
    if (matches === 0) throw new Error('no runs');
    return { side, dark };
};

const isFinder = ({ dark }: Grid, top: number, left: number) => {
    for (let row = 0; row < 7; row += 1) {
        for (let col = 0; col < 7; col += 1) {
            const ring = Math.max(Math.abs(row - 3), Math.abs(col - 3));
            const expected = ring === 3 || ring <= 1;
            if (dark[top + row]![left + col] !== expected) return false;
        }
    }
    return true;
};

const LOGIN_URL = 'https://music.163.com/login?codekey=59444a42-4322-413f-8f3f-bdbe872a6f44';

describe('qrImage', () => {
    it('renders a QR symbol with a quiet zone and three finder patterns', () => {
        const grid = parseSvg(buildQrSvg(LOGIN_URL));

        // 4 modules of quiet zone on every side, plus a 37-module symbol for this payload.
        expect(grid.side).toBe(45);
        for (let index = 0; index < grid.side; index += 1) {
            for (const offset of [0, 1, 2, 3]) {
                expect(grid.dark[offset]![index]).toBe(false);
                expect(grid.dark[grid.side - 1 - offset]![index]).toBe(false);
                expect(grid.dark[index]![offset]).toBe(false);
                expect(grid.dark[index]![grid.side - 1 - offset]).toBe(false);
            }
        }
        for (const [top, left] of [[4, 4], [4, grid.side - 11], [grid.side - 11, 4]] as const) {
            expect(isFinder(grid, top, left)).toBe(true);
        }
    });

    it('is deterministic and reacts to the payload', () => {
        expect(buildQrSvg(LOGIN_URL)).toBe(buildQrSvg(LOGIN_URL));
        expect(buildQrSvg(LOGIN_URL)).not.toBe(buildQrSvg(`${LOGIN_URL}x`));
    });

    it('wraps the symbol in a self-contained data URL', () => {
        const dataUrl = buildQrDataUrl(LOGIN_URL);
        expect(dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
        const decoded = Buffer.from(dataUrl.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8');
        expect(decoded).toBe(buildQrSvg(LOGIN_URL));
        // Same shape the three providers hand to `<img src>`; keep it small enough to inline.
        expect(dataUrl.length).toBeLessThan(20000);
    });

    it('refuses a payload that cannot fit a QR symbol', () => {
        expect(() => buildQrSvg('x'.repeat(4000))).toThrow();
    });
});
