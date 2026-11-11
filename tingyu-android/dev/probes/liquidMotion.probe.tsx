import ConfirmDialog from '../../src/components/shared/ConfirmDialog';
import React, { useCallback, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import MobileSheet from '../../src/library/suites/mobile/MobileSheet';
import MobileStageMenu from '../../src/components/app/overlays/mobile-stage/MobileStageMenu';
import { runTopModalBack } from '../../src/services/modalBackStack';
import { useMotionSettingsStore } from '../../src/stores/useMotionSettingsStore';
import { useSleepTimerStore } from '../../src/stores/useSleepTimerStore';
import SleepTimerSheet from '../../src/components/modal/SleepTimerSheet';
import type { ProbeDefinition } from './definition';
import '../../src/library/suites/mobile/mobileLibrary.css';

// dev/probes/liquidMotion.probe.tsx
// Real production overlays; only their parent visibility and counters are provided here.
function LiquidMotionProbe() {
    const [sheet,setSheet]=useState(false);
    const [confirm,setConfirm]=useState(false);
    const [selfConfirm,setSelfConfirm]=useState(false);
    const [menu,setMenu]=useState(false);
    const [closing,setClosing]=useState(false);
    const [closed,setClosed]=useState(0);
    const [revision,setRevision]=useState(0);
    const sleep=useSleepTimerStore(state=>state.sleepTimerSheetOpen);
    const closeMenu=useCallback(()=>setClosing(true),[]);
    const finishMenu=useCallback(()=>{setMenu(false);setClosed(v=>v+1)},[]);
    return <div style={{padding:24,background:'#e6edf2',height:'100vh'}}>
        <button data-testid="open-confirm" onClick={()=>setConfirm(true)}>确认框</button>
        <button data-testid="open-self-confirm" onClick={()=>setSelfConfirm(true)}>独立确认框</button>
        <button data-testid="open-sleep" onClick={()=>useSleepTimerStore.setState({sleepTimerSheetOpen:true})}>定时关闭</button>
        <button data-testid="force-confirm-close" onClick={()=>setConfirm(false)}>移除确认框</button>
        <button data-testid="force-sleep-close" onClick={()=>useSleepTimerStore.setState({sleepTimerSheetOpen:false})}>移除定时</button>
        <button data-testid="open-sheet" onClick={()=>setSheet(true)}>打开抽屉</button>
        <button data-testid="open-menu" data-mps-more onClick={()=>{setMenu(true);setClosing(false)}}>打开菜单</button>
        <button data-testid="back" data-mps-more onClick={()=>runTopModalBack()}>系统返回</button>
        <button data-testid="refresh" data-mps-more onClick={()=>setRevision(v=>v+1)}>刷新 {revision}</button>
        <button data-testid="reduce" onClick={()=>useMotionSettingsStore.getState().handleToggleReducedMotionSurface('uiMicroMotion',true)}>减少动态</button>
        <output data-testid="closed">{closed}</output>
        <output data-testid="sleep">{String(sleep)}</output>
        <AnimatePresence>{confirm&&<ConfirmDialog key="confirm" presenceOwner="parent" isOpen={true} nativeStatic={false} title="账号切换回归" confirmText="确认切换" cancelText="取消切换" onConfirm={()=>setConfirm(false)} onClose={()=>setConfirm(false)}/>}</AnimatePresence>
        <ConfirmDialog isOpen={selfConfirm} nativeStatic={false} title="独立确认回归" onConfirm={()=>setSelfConfirm(false)} onClose={()=>setSelfConfirm(false)}/>
        <AnimatePresence>{sleep&&<SleepTimerSheet key="sleep"/>}</AnimatePresence>
        <AnimatePresence>{sheet&&<MobileSheet title="动效回归" onClose={()=>{setSheet(false);setClosed(v=>v+1)}}>
            <button data-testid="inside">内部按钮</button>
            <button data-testid="external-close" onClick={()=>setSheet(false)}>外部状态关闭</button>
        </MobileSheet>}</AnimatePresence>
        <div style={{position:'absolute',right:24,top:100}}>{menu&&<MobileStageMenu onClose={()=>closeMenu()} closing={closing} onClosed={finishMenu}/>}</div>
    </div>;
}
export default {id:'liquidMotion',title:'Liquid Motion 实际浮层',description:'抽屉、菜单、退出保留、重复操作与系统返回。',Component:LiquidMotionProbe} satisfies ProbeDefinition;
