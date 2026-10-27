import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { MotionValue } from 'framer-motion';
import { COMPOSE_CHROME_FAILURE_EVENT, PREHIDE_COMPOSE_CHROME, canUseComposeChrome, newChromeGeneration, chromeNative, chromeClockNeedsAnchor, chromeWindowInteraction, type ChromeSurfaceId, type ChromeData } from '../services/nativeChrome';
import { isMainStageActive, subscribeMainStageActivity } from '../utils/stageActivity';
import { hasBlockingWindow } from '../utils/keyboardTargets';

// src/hooks/useComposeChrome.ts
// Event-driven metadata/layout; a live clock is anchored every 2s and on discontinuous seeks.
export function useComposeChrome(ref:RefObject<HTMLElement|null>,id:ChromeSurfaceId,active:boolean,data:ChromeData,
    actions:Record<string,((value:number)=>void)|undefined>,clock?:MotionValue<number>) {
    const [ready,setReady]=useState(false);
    const latest=useRef({active,data,actions,clock});latest.current={active,data,actions,clock};
    const scheduleRef=useRef<()=>void>(()=>{});
    useLayoutEffect(()=>{scheduleRef.current();});
    useLayoutEffect(()=>{
        const node=ref.current;if(!node||!active)return;
        // The layout effect runs before the first paint: suppress the old controls while the
        // native host probes/attaches, then restore them if this device cannot run it.
        if(PREHIDE_COMPOSE_CHROME)node.dataset.composePending='true';
        let held=false,failed=false;
        let disposed=false,started=false,frame=0,deadline=0,revision=0,busy=false,last='',lastAt=-Infinity,lastPosition=0;
        const session=crypto.randomUUID(),generation=newChromeGeneration();
        let listener:{remove:()=>Promise<void>}|undefined,resize:ResizeObserver|undefined,mutations:MutationObserver|undefined;
        let unsubscribeClock:(()=>void)|undefined,unsubscribeActivity:(()=>void)|undefined;
        const mark=(value:boolean,keepPending=false)=>{if(disposed)return;if(!value&&held){held=false;chromeWindowInteraction('end');}if(value)node.dataset.composeNative='true';else delete node.dataset.composeNative;
            if(keepPending&&PREHIDE_COMPOSE_CHROME)node.dataset.composePending='true';else delete node.dataset.composePending;setReady(value);};
        const remove=()=>chromeNative.remove({id,session}).catch(()=>{});
        // All surfaces share one native host. A host failure must restore every web fallback.
        const hostFailed=()=>{failed=true;started=false;mark(false);void remove();};
        window.addEventListener(COMPOSE_CHROME_FAILURE_EVENT,hostFailed);
        const position=()=>latest.current.clock?.get()??0;
        const measure=async()=>{
            frame=0;if(disposed||!started||busy)return;
            const current=latest.current,rect=node.getBoundingClientRect(),style=getComputedStyle(node);
            const enabled=current.active&&isMainStageActive()&&!hasBlockingWindow()&&!node.closest('[inert]')&&node.getAttribute('aria-hidden')!=='true'
                &&style.visibility!=='hidden'&&style.display!=='none'&&Number(style.opacity)>.01&&rect.width>0&&rect.height>0;
            const packet={id,session,generation,enabled,left:rect.left,top:rect.top,width:rect.width,height:rect.height,alpha:Number(style.opacity),viewportWidth:innerWidth,data:current.data};
            const key=JSON.stringify(packet);
            if(key!==last){
                last=key;busy=true;
                try{const result=await chromeNative.update({...packet,revision:++revision,data:{...packet.data,position:position()}});
                    if(disposed||!started){void remove();return;}
                    const accepted=result.accepted&&result.session===session;
                    mark(enabled&&accepted,!enabled&&accepted);
                    lastAt=performance.now();lastPosition=position();
                }catch(error){console.warn('[ComposeChrome] Keeping web controls after native failure',error);window.dispatchEvent(new Event(COMPOSE_CHROME_FAILURE_EVENT));}
                finally{busy=false;}
            }
            if(performance.now()<deadline&&!disposed)frame=requestAnimationFrame(()=>void measure());
        };
        const schedule=()=>{deadline=performance.now()+400;if(started&&!frame&&!disposed)frame=requestAnimationFrame(()=>void measure());};
        scheduleRef.current=schedule;
        const onClock=()=>{
            if(!started||disposed||node.dataset.composeNative!=='true'||!isMainStageActive())return;
            const now=performance.now(),time=position();
            if(chromeClockNeedsAnchor(now,lastAt,time,lastPosition,!!latest.current.data.playing)){
                lastAt=now;lastPosition=time;void chromeNative.clock({id,session,trackKey:latest.current.data.trackKey??'',position:time}).catch(()=>{});
            }
        };
        const overlaySelector='[data-folia-keyboard-window="true"],[inert],[aria-hidden]';
        const relevant=(record:MutationRecord)=>record.type==='attributes'||[...record.addedNodes,...record.removedNodes].some(value=>value instanceof Element&&(value.matches(overlaySelector)||value.querySelector(overlaySelector)));
        void canUseComposeChrome().then(async supported=>{
            if(disposed||failed)return;
            if(!supported){mark(false);return;}
            listener=await chromeNative.addListener('action',event=>{
                if(disposed||event.id!==id||event.session!==session)return;
                if(event.action==='interactionEnd'){held=false;chromeWindowInteraction('end');return;}
                if(!latest.current.active||node.dataset.composeNative!=='true'||hasBlockingWindow())return;
                if(event.action==='interactionStart'){held=true;chromeWindowInteraction('start');return;}
                const handler=latest.current.actions[event.action];if(!handler)return;
                chromeWindowInteraction('start');try{handler(Number.isFinite(event.value)?event.value:0);}finally{chromeWindowInteraction('end');}
            });
            if(disposed||failed){void listener.remove();return;}
            started=true;resize=new ResizeObserver(schedule);resize.observe(node);
            mutations=new MutationObserver(records=>{if(records.some(relevant))schedule();});
            mutations.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['inert','aria-hidden','data-folia-keyboard-window']});
            unsubscribeActivity=subscribeMainStageActivity(schedule);unsubscribeClock=latest.current.clock?.on('change',onClock);
            window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);
            window.addEventListener('transitionrun',schedule);schedule();
        }).catch(error=>{console.warn('[ComposeChrome] Native host unavailable',error);mark(false);});
        return()=>{
            disposed=true;if(held)chromeWindowInteraction('end');setReady(false);cancelAnimationFrame(frame);resize?.disconnect();mutations?.disconnect();unsubscribeActivity?.();unsubscribeClock?.();
            window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);window.removeEventListener('transitionrun',schedule);
            window.removeEventListener(COMPOSE_CHROME_FAILURE_EVENT,hostFailed);
            // During a route exit the WebView footer can stay mounted for its outgoing animation.
            // Keep its legacy paint suppressed until it either unmounts or native takeover restarts.
            const wasNative=node.dataset.composeNative==='true';
            delete node.dataset.composeNative;
            if(wasNative&&PREHIDE_COMPOSE_CHROME)node.dataset.composePending='true';else delete node.dataset.composePending;
            void listener?.remove();if(started)void remove();scheduleRef.current=()=>{};
        };
    },[id,ref,active]);
    return ready;
}
