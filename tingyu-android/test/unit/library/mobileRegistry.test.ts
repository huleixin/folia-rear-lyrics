import { describe, expect, it } from 'vitest';
import { DEFAULT_LIBRARY_SUITE_ID, listLibrarySuites, hasLibrarySuite, resolveLibrarySurface, resolveLibraryStage, listLibrarySuiteOverlays, hasLibrarySuiteChoice } from '@/library/registry';
import { LIBRARY_ACCOUNT_ACTION_IDS } from '@/library/core/model/librarySuites';
import { useAppViewStore } from '@/stores/useAppViewStore';
import { COMMAND_PALETTE_COMMANDS } from '@/components/command-palette/commandRegistry';

// test/unit/library/mobileRegistry.test.ts
describe('Tingyu mobile-only navigation',()=>{
    it('discovers only the mobile suite, including its migrated login surface',()=>{
        expect(DEFAULT_LIBRARY_SUITE_ID).toBe('mobile');expect(listLibrarySuites().map(x=>x.id)).toEqual(['mobile']);expect(hasLibrarySuiteChoice()).toBe(false);
        for(const id of ['grid','bravais','tui'])expect(hasLibrarySuite(id)).toBe(false);
        for(const surface of ['home','collection','artist','account'] as const){const view=resolveLibrarySurface(surface,'mobile');expect(view.suiteId).toBe('mobile');expect(view.component).toBeDefined();expect(view.isFallback).toBe(false);}
        expect([...resolveLibrarySurface('account','mobile').declaredActions.actions].sort()).toEqual([...LIBRARY_ACCOUNT_ACTION_IDS].sort());
    });
    it('migrates old or unknown interface choices to the same stable mobile surface',()=>{
        for(const surface of ['home','collection','artist','account'] as const){const base=resolveLibrarySurface(surface,'mobile');for(const old of ['grid','bravais','tui','unknown'])expect(resolveLibrarySurface(surface,old)).toBe(base);}
        expect(listLibrarySuiteOverlays()).toEqual([]);expect(resolveLibraryStage('mobile')?.component).toBeDefined();
    });
    it('maps deleted collage view state to the normal player',()=>{useAppViewStore.getState().setView('lattice');expect(useAppViewStore.getState().view).toBe('player');useAppViewStore.getState().setView('home');});
    it('keeps working phone tools and removes retired command entry points',()=>{
        const ids=COMMAND_PALETTE_COMMANDS.map(c=>c.id);expect(ids).toEqual(expect.arrayContaining(['panel-cover','panel-queue','panel-onlineLyrics','export-current-lyrics-lrc']));expect(ids.filter(id=>/ponder|lattice|bravais|desktop-toggle|remote-control|obs/.test(id))).toEqual([]);
    });
});
