import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { NATIVE_FIRST, canUseNativePages, nativePages } from '../services/nativePages';
import { newChromeGeneration } from '../services/nativeChrome';
import { isMainStageActive, subscribeMainStageActivity } from '../utils/stageActivity';
import type { NativePageId, NativePageModel, PageActions } from '../types/nativePages';
import '../styles/nativePages.css';
import { useNativePageImages } from './useNativePageImages';
import { useStableNativeData } from './useStableNativeData';
import { sameNativeEnvelope } from '../utils/nativePacketData';
import {flushNativeShellRoute} from '../services/nativeShellCommit';

export function useNativePagesAvailable() {
    const [available,setAvailable]=useState(NATIVE_FIRST);
    useEffect(()=>{let alive=true;void canUseNativePages().then(value=>{if(alive)setAvailable(NATIVE_FIRST||value)});return()=>{alive=false}},[]);
    return available;
}

// src/hooks/useNativePage.ts
// A page sends discrete models only. Scrolling, IME, image loading and list recycling are native.
export function useNativePage(ref: RefObject<HTMLElement | null>, id: NativePageId, active: boolean,
    model: NativePageModel, actions: PageActions, onReady?: (ready: boolean) => void) {
    model=useNativePageImages(useStableNativeData(model),active);
    const [ready, setReady] = useState(NATIVE_FIRST);
    const latest = useRef({ active, model, actions, onReady }); latest.current = { active, model, actions, onReady };
    const sync = useRef<() => void>(() => {});
    useLayoutEffect(() => { if(NATIVE_FIRST&&ref.current)ref.current.dataset.nativePage='true';sync.current(); },[model,active,ref]);
    // Adapters may live below the element owning ref. Its DOM ref is attached after
    // descendant layout effects; subscribe after commit so cold-start data is never missed.
    useEffect(() => {
        const node = ref.current; if (!node || !active) return;
        if(NATIVE_FIRST)node.dataset.nativePage='true';
        const session = crypto.randomUUID(), generation = newChromeGeneration();
        let disposed = false, started = false, revision = 0, frame = 0;
        let last: object | undefined;
        let listener: { remove(): Promise<void> } | undefined;
        let resize: ResizeObserver | undefined, mutation: MutationObserver | undefined, unsubscribe: (() => void) | undefined;
        const mark = (value: boolean) => {
            if (disposed) return;
            const owned=NATIVE_FIRST||value;
            if (owned) node.dataset.nativePage = 'true'; else delete node.dataset.nativePage;
            setReady(owned); latest.current.onReady?.(owned);
        };
        const remove = () => nativePages.pageRemove({ id, session }).catch(() => {});
        const measure = () => {
            frame = 0; if (disposed || !started) return;
            if(!isMainStageActive())return;
            flushNativeShellRoute();
            const current = latest.current, rect = node.getBoundingClientRect(), style = getComputedStyle(node);
            // A document capture and its key are one model. Never publish a header-only
            // settings/index substitute between the two layout-effect passes.
            if(current.model.key.startsWith('settings:document:')&&!current.model.document)return;
            const enabled = current.active && isMainStageActive() && (NATIVE_FIRST&&id==='collection'||!node.closest('[inert]'))
                && (style.visibility !== 'hidden'||node.dataset.nativeDocumentRoot==='true') && style.display !== 'none' && rect.width > 0 && rect.height > 0;
            const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--folia-main-inset-top')) || 0;
            const safeBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--folia-main-inset-bottom')) || 0;
            const packet = { id, session, generation, enabled, left: rect.left, top: rect.top, width: rect.width,
                height: rect.height, viewportWidth: innerWidth, safeTop, safeBottom, model: current.model,
                navigation:document.documentElement.dataset.nativeNavigation??'' };
            if (sameNativeEnvelope(last, packet)) return; last = packet;
            const sent = ++revision; if (!enabled) mark(false);
            void nativePages.pageUpdate({ ...packet, revision: sent }).then(result => {
                if (disposed) { void remove(); return; }
                if (sent === revision) mark(enabled && result.accepted && result.session === session);
            }).catch(error => {
                if (sent !== revision || disposed) return;
                console.warn('[NativePages] Native page update failed', error);
                last = undefined; mark(false);
            });
        };
        const schedule = () => { if (!frame && !disposed) frame = requestAnimationFrame(measure); };
        sync.current = schedule;
        void canUseNativePages().then(async supported => {
            if (!supported || disposed) return;
            listener = await nativePages.addListener('pageAction', event => {
                const current = latest.current;
                if (disposed || !current.active || event.id !== id || event.session !== session || event.key !== current.model.key
                    || node.dataset.nativePage !== 'true') return;
                current.actions[event.action]?.({ text: event.text, value: event.value });
            });
            if (disposed) { void listener.remove(); return; }
            started = true; resize = new ResizeObserver(schedule); resize.observe(node);
            mutation = new MutationObserver(records => {
                if (records.some(record => record.type === 'childList'
                    ? [...record.addedNodes, ...record.removedNodes].some(item => item instanceof Element &&
                        (item.matches('[data-folia-keyboard-window]') || item.querySelector('[data-folia-keyboard-window]')))
                    : record.attributeName === 'data-folia-keyboard-window' || record.target instanceof Element && record.target.contains(node))) measure();
            });
            mutation.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['inert', 'data-folia-keyboard-window'] });
            unsubscribe = subscribeMainStageActivity(measure);
            window.addEventListener('resize', schedule); window.visualViewport?.addEventListener('resize', schedule);
            measure();
        }).catch(() => mark(false));
        return () => {
            disposed = true; cancelAnimationFrame(frame); resize?.disconnect(); mutation?.disconnect(); unsubscribe?.();
            window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule);
            if(!NATIVE_FIRST)delete node.dataset.nativePage;
            setReady(NATIVE_FIRST); latest.current.onReady?.(NATIVE_FIRST);
            void listener?.remove(); if (started) void remove(); sync.current = () => {};
        };
    }, [active, id, ref]);
    return ready;
}
