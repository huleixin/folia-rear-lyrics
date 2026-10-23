import { describe, expect, it } from 'vitest';
import fs from 'fs';
import {
    CONTRACT_PATH,
    MAIN_ENTRY_SECTION,
    OUTPUT_PATH,
    parseContract as parseContractJs,
    renderApiDocs,
} from '../../../dev/folium/api-docs.mjs';

// test/unit/mod-system/foliumApiDocs.test.ts
// docs/folium/api.md is generated from src/mods/folium/contract.ts. These pin
// that the reference is current (a contract change must come with
// `npm run folium:api`), that every exported type is in it, that every
// public declaration and member carries a description, and that types land
// under the entry (client or main) that actually hands them out.

interface ParsedItem {
    name: string;
    doc: string;
    header?: string;
    source?: string;
    members?: { name: string; doc: string; type: string }[];
}
const parseContract = (text: string) => parseContractJs(text) as unknown as { title: string; items: ParsedItem[] }[];

const contract = fs.readFileSync(CONTRACT_PATH, 'utf8');

/* Folium type names an item's signature mentions (header, member types, or type source). */
const signatureNames = (item: ParsedItem) => {
    const text = [item.header ?? '', item.source ?? '', ...(item.members ?? []).map((member) => member.type)].join(' ');
    return text.match(/\bFolium[A-Z]\w*/g) ?? [];
};

describe('Folium API reference', () => {
    it('is up to date with the contract (run `npm run folium:api`)', () => {
        expect(fs.readFileSync(OUTPUT_PATH, 'utf8')).toBe(renderApiDocs(contract));
    });

    it('covers every exported declaration', () => {
        const exported = [...contract.matchAll(/^export (?:interface|type|const) (\w+)/gm)].map((match) => match[1]).sort();
        const documented = parseContract(contract).flatMap((section) => section.items.map((item) => item.name)).sort();
        expect(documented).toEqual(exported);
    });

    it('describes every declaration and member', () => {
        const missing: string[] = [];
        for (const section of parseContract(contract)) {
            for (const item of section.items) {
                if (!item.doc) missing.push(item.name);
                for (const member of item.members ?? []) {
                    if (!member.doc) missing.push(`${item.name}.${member.name}`);
                }
            }
        }
        expect(missing).toEqual([]);
    });

    // The client entry section promises that everything in it comes from `activate(folium)`.
    it('files under the client entry only types that activate(folium) reaches', () => {
        const sections = parseContract(contract);
        const byName = new Map(sections.flatMap((section) => section.items).map((item) => [item.name, item]));
        const reachable = new Set<string>();
        const pending = ['FoliumClientModule'];
        while (pending.length > 0) {
            const name = pending.pop()!;
            const item = byName.get(name);
            if (!item || reachable.has(name)) continue;
            reachable.add(name);
            pending.push(...signatureNames(item));
        }
        const client = sections.find((section) => section.title === 'Client API');
        expect(client?.items.length).toBeGreaterThan(0);
        expect(client!.items.map((item) => item.name).filter((name) => !reachable.has(name))).toEqual([]);
    });

    it('lists main-entry-only types under the main entry heading, linked from its member table', () => {
        const sections = parseContract(contract);
        const mainEntry = sections.find((section) => section.title === MAIN_ENTRY_SECTION)?.items ?? [];
        expect(mainEntry.map((item) => item.name)).toContain('FoliumModPaths');

        const misplaced = sections
            .filter((section) => section.title !== MAIN_ENTRY_SECTION)
            .flatMap((section) => section.items)
            .filter((item) => /main entr(?:y|ies) only/i.test(item.doc))
            .map((item) => item.name);
        expect(misplaced).toEqual([]);

        const docs = renderApiDocs(contract);
        const chapter = docs.indexOf('\n## main 入口（Node）\n');
        expect(chapter).toBeGreaterThan(-1);
        const toc = docs.split('\n').find((line) => line.startsWith('- **main 入口（Node）**'));
        const clientToc = docs.split('\n').find((line) => line.startsWith('- **客户端入口**'));
        for (const { name } of mainEntry) {
            const anchor = `(#${name.toLowerCase()})`;
            const heading = docs.indexOf(`\n### ${name}\n`);
            expect(heading, name).toBeGreaterThan(chapter);
            expect(docs.indexOf(`\n### ${name}\n`, heading + 1), name).toBe(-1);
            expect(docs.slice(chapter, heading), `${name} linked from the main entry table`).toContain(anchor);
            expect(toc, name).toContain(anchor);
            expect(clientToc, name).not.toContain(anchor);
        }
    });
});
