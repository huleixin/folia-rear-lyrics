import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { MotionValue } from 'framer-motion';
import { COMPOSE_CHROME_FAILURE_EVENT, PREHIDE_COMPOSE_CHROME, canUseComposeChrome, newChromeGeneration, chromeNative, chromeClockNeedsAnchor, chromeWindowInteraction, hasBlockingChromeWindow, type ChromeSurfaceId, type ChromeData } from '../services/nativeChrome';
import { isMainStageActive, subscribeMainStageActivity } from '../utils/stageActivity';
import { useStableNativeData } from './useStableNativeData';
import { sameNativeEnvelope } from '../utils/nativePacketData';
import {flushNativeShellRoute} from '../services/nativeShellCommit';
import { dispatchChromeAction, type ChromeActionHandlers } from '../services/nativeChromeActions';

// src/hooks/useComposeChrome.ts
// Event-driven metadata/layout; a live clock is anchored every 2s and on discontinuous seeks.
export function useComposeChrome(ref:RefObject<HTMLElement|null>,id:ChromeSurfaceId,active:boolean,data:ChromeData,
    actions:ChromeActionHandlers,clock?:MotionValue<number>) {
    data=useStableNativeData(data);
    const [ready,setReady]=useState(PREHIDE_COMPOSE_CHROME);
    const latest=useRef({active,data,actions,clock});latest.current={active,data,actions,clock};
    const scheduleRef=useRef<()=>void>(()=>{});
    useLayoutEffect(()=>{if(PREHIDE_COMPOSE_CHROME&&ref.current)ref.current.dataset.composeNative='true';scheduleRef.current();},[data,active,ref]);
    useLayoutEffect(()=>{
        const node=ref.current;if(!node||!active)return;
        // Android owns these controls from Activity startup; acknowledgements only update data.
        // A slow or failed bridge must never expose the legacy control tree.
        let held=false,failed=false;
        let disposed=false,started=false,frame=0,deadline=0,revision=0,lastAt=-Infinity,lastPosition=0;
        let last:object|undefined;
        const session=crypto.randomUUID(),generation=newChromeGeneration();
        let listener:{remove:()=>Promise<void>}|undefined,resize:ResizeObserver|undefined,mutations:MutationObserver|undefined;
        let unsubscribeClock:(()=>void)|undefined,unsubscribeActivity:(()=>void)|undefined;
        const mark=(value:boolean,keepPending=false)=>{if(disposed)return;if(!value&&held){held=false;chromeWindowInteraction('end');}if(value||PREHIDE_COMPOSE_CHROME)node.dataset.composeNative='true';else delete node.dataset.composeNative;
            if(keepPending&&PREHIDE_COMPOSE_CHROME)node.dataset.composePending='true';else delete node.dataset.composePending;setReady(PREHIDE_COMPOSE_CHROME||value);};
        const remove=()=>chromeNative.remove({id,session}).catch(()=>{});
        // Keep the last native presentation on an engine failure; never switch renderers.
        const hostFailed=()=>{failed=true;started=false;mark(false);};
        window.addEventListener(COMPOSE_CHROME_FAILURE_EVENT,hostFailed);
        const position=()=>latest.current.clock?.get()??0;
        const measure=async()=>{
            frame=0;if(disposed||!started)return;
            // Window backgrounding is not a route/visibility change. Preserve the native pose.
            if(!isMainStageActive())return;
            flushNativeShellRoute();
            // Track only short layout transitions; a slow draw reply must not stall geometry.
            if(performance.now()<deadline)frame=requestAnimationFrame(()=>void measure());
            const current=latest.current;
            // The native shell already owns route/overlay interaction. An invisible
            // ancestor's web-entry inert timer must not hold its footer for another 400ms.
            const nativeFooter=PREHIDE_COMPOSE_CHROME;
            // Native footers own their placement. Measuring hidden HTML here can
            // synchronously lay out the whole browsing tree for no visual benefit.
            const rect=nativeFooter?{left:0,top:0,width:innerWidth,height:id==='nav'?54:id==='stage'?136:46}:node.getBoundingClientRect();
            const style=nativeFooter?{opacity:'1',visibility:'visible',display:'block'}:getComputedStyle(node);
            const enabled=current.active&&isMainStageActive()&&!hasBlockingChromeWindow()&&(nativeFooter||!node.closest('[inert]')&&node.getAttribute('aria-hidden')!=='true'
                &&style.visibility!=='hidden'&&style.display!=='none'&&Number(style.opacity)>.01&&rect.width>0&&rect.height>0);
            const safeBottom=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--folia-main-inset-bottom'))||0;
            const packet={id,session,generation,enabled,left:rect.left,top:rect.top,width:rect.width,height:rect.height,alpha:Number(style.opacity),viewportWidth:innerWidth,safeBottom,data:current.data};
            if(!sameNativeEnvelope(last,packet)){
                last=packet;const sentRevision=++revision;
                // Never queue a hide behind a pending first-draw acknowledgement.
                if(!enabled)mark(false,true);
                try{const result=await chromeNative.update({...packet,revision:sentRevision,data:{...packet.data,position:position()}});
                    if(disposed||!started){void remove();return;}
                    if(sentRevision!==revision)return;
                    const accepted=result.accepted&&result.session===session;
                    mark(enabled&&accepted,!enabled&&accepted);
                    lastAt=performance.now();lastPosition=position();
                }catch(error){if(sentRevision===revision){console.warn('[ComposeChrome] Native control update failed',error);window.dispatchEvent(new Event(COMPOSE_CHROME_FAILURE_EVENT));}}
            }
        };
        const schedule=()=>{deadline=performance.now()+(PREHIDE_COMPOSE_CHROME?0:400);if(started&&!frame&&!disposed)frame=requestAnimationFrame(()=>void measure());};
        // React visibility/route changes are delivered in the layout effect, before paint.
        scheduleRef.current=()=>{deadline=performance.now()+(PREHIDE_COMPOSE_CHROME?0:400);cancelAnimationFrame(frame);frame=0;void measure();};
        const onClock=()=>{
            if(!started||disposed||node.dataset.composeNative!=='true'||!isMainStageActive())return;
            const now=performance.now(),time=position();
            if(chromeClockNeedsAnchor(now,lastAt,time,lastPosition,!!latest.current.data.playing)){
                lastAt=now;lastPosition=time;void chromeNative.clock({id,session,trackKey:latest.current.data.trackKey??'',position:time}).catch(()=>{});
            }
        };
        const overlaySelector='[data-folia-keyboard-window="true"]';
        const relevant=(record:MutationRecord)=>record.type==='attributes'
            ?record.attributeName==='data-folia-keyboard-window'||record.target instanceof Element&&(record.target===node||record.target.contains(node))
            :[...record.addedNodes,...record.removedNodes].some(value=>value instanceof Element&&(value.matches(overlaySelector)||value.querySelector(overlaySelector)));
        const syncVisibility=()=>{cancelAnimationFrame(frame);frame=0;void measure();};
        const onTransition=(event:Event)=>{if(event.target instanceof Element&&(event.target===node||event.target.contains(node)))schedule();};
        void canUseComposeChrome().then(async supported=>{
            if(disposed||failed)return;
            if(!supported){mark(false);return;}
            listener=await chromeNative.addListener('action',event=>{
                if(disposed||failed||event.id!==id||event.session!==session)return;
                if(event.action==='interactionEnd'){held=false;chromeWindowInteraction('end');return;}
                if(!latest.current.active||node.dataset.composeNative!=='true'||hasBlockingChromeWindow())return;
                if(event.action==='interactionStart'){held=true;chromeWindowInteraction('start');return;}
                chromeWindowInteraction('start');try{dispatchChromeAction(latest.current.actions,event.action,event.value);}finally{chromeWindowInteraction('end');}
            });
            if(disposed||failed){void listener.remove();return;}
            started=true;resize=new ResizeObserver(schedule);resize.observe(node);
            mutations=new MutationObserver(records=>{if(records.some(relevant))syncVisibility();});
            mutations.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['inert','aria-hidden','data-folia-keyboard-window']});
            unsubscribeActivity=subscribeMainStageActivity(syncVisibility);unsubscribeClock=latest.current.clock?.on('change',onClock);
            window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);
            window.addEventListener('transitionrun',onTransition);syncVisibility();
        }).catch(error=>{console.warn('[ComposeChrome] Native host unavailable',error);mark(false);});
        return()=>{
            disposed=true;if(held)chromeWindowInteraction('end');setReady(PREHIDE_COMPOSE_CHROME);cancelAnimationFrame(frame);resize?.disconnect();mutations?.disconnect();unsubscribeActivity?.();unsubscribeClock?.();
            window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);window.removeEventListener('transitionrun',onTransition);
            window.removeEventListener(COMPOSE_CHROME_FAILURE_EVENT,hostFailed);
            // During a route exit the WebView footer can stay mounted for its outgoing animation.
            // Keep its legacy paint suppressed until it either unmounts or native takeover restarts.
            const wasNative=node.dataset.composeNative==='true'||node.dataset.composePending==='true';
            if(!PREHIDE_COMPOSE_CHROME)delete node.dataset.composeNative;
            if(wasNative&&PREHIDE_COMPOSE_CHROME)node.dataset.composePending='true';else delete node.dataset.composePending;
            void listener?.remove();if(started)void remove();scheduleRef.current=()=>{};
        };
    },[id,ref,active]);
    return ready;
}
