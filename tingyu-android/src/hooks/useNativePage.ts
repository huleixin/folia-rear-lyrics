import { noteUiInteraction, markStartupReady } from '../services/uiWarmup';
import { navigationMark } from '../services/navigationTiming';
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
import { refreshNativeSettingsDocument, settingsDiagnostic } from '../services/settingsDiagnostics';

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
            const measuredAt=performance.timeOrigin+performance.now();
            frame = 0; if (disposed || !started) return;
            if(!isMainStageActive())return;
            flushNativeShellRoute();
            // 极简入场窗口（路由已指向 stage、呈现为 minimal）：首页此刻正被原生页整块举着，
            // 等极简页 360ms 上滑盖住。这里任何 ownership 翻转都会把 WebView 回退副本挂回来
            // —— 录屏 68537 的 0.53~0.70s「推荐标题/卡片重复、放大错位、右侧碎片」的来源。
            // 入场期间冻结首页的发布与摘除；窗口随路由离开 stage 或组件卸载自然结束。
            const presentation = document.querySelector('[data-folia-player-presentation]')?.getAttribute('data-folia-player-presentation') ?? '';
            const minimalEntryFreeze = NATIVE_FIRST && id === 'home' && presentation === 'minimal'
                && document.documentElement.dataset.nativeRoute === 'stage';
            if (minimalEntryFreeze) {
                // 排查埋点：innerWidth 含滚动条、clientWidth 不含 —— 两者差值就是
                // 「viewport 记错了 8%」类几何包问题的直接证据。
                console.info('[entry-debug] home frozen during minimal entry',
                    JSON.stringify({ route: document.documentElement.dataset.nativeRoute, presentation,
                        innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth,
                        rect: node.getBoundingClientRect().toJSON() }));
                return;
            }
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
            navigationMark('page-layout-capture',measuredAt);
            navigationMark('page-send');
            void nativePages.pageUpdate({ ...packet, revision: sent }).then(result => {
                navigationMark('page-ack');
                if (disposed) { void remove(); return; }
                if (sent === revision) {const accepted=enabled && result.accepted && result.session === session;mark(accepted);if(accepted)markStartupReady('page');
                    if(enabled&&!accepted){last=undefined;settingsDiagnostic('page-rejected',{id,session,key:current.model.key,navigation:packet.navigation,reason:result.reason??'native-rejected'});}}
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
                if(disposed||!current.active||event.id!==id)return;
                if(event.action==='__refresh'){
                    last=undefined;refreshNativeSettingsDocument(event.text??'native-stale-presentation');schedule();return;
                }
                const reason=event.session!==session?'session-mismatch':event.key!==current.model.key?'key-mismatch':node.dataset.nativePage!=='true'?'ownership-mismatch':!current.actions[event.action]?'unknown-control':'';
                settingsDiagnostic(reason?'action-rejected':'action-accepted',{id,session,key:current.model.key,eventSession:event.session,eventKey:event.key,control:event.action,route:document.documentElement.dataset.nativeRoute,navigation:document.documentElement.dataset.nativeNavigation,reason});
                if(reason){last=undefined;refreshNativeSettingsDocument(reason);schedule();return;}
                noteUiInteraction();
                navigationMark('page-event-js',event.nativeDispatchedAt,event.nativeGestureId);
                navigationMark('page-business-start',undefined,event.nativeGestureId);
                current.actions[event.action]?.({ text: event.text, value: event.value });
            });
            navigationMark('page-listener-ready');
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
            document.addEventListener('tingyu-native-navigation',schedule);
            measure();
        }).catch(() => mark(false));
        return () => {
            disposed = true; cancelAnimationFrame(frame); resize?.disconnect(); mutation?.disconnect(); unsubscribe?.();
            window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule);
            document.removeEventListener('tingyu-native-navigation',schedule);
            if(!NATIVE_FIRST)delete node.dataset.nativePage;
            setReady(NATIVE_FIRST); latest.current.onReady?.(NATIVE_FIRST);
            void listener?.remove(); if (started) void remove(); sync.current = () => {};
        };
    }, [active, id, ref]);
    return ready;
}
