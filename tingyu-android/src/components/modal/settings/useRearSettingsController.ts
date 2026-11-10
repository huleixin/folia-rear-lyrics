import { useRef,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toggleRearCardKeepAwake,toggleRearCardAod,setRearLyricsBackend,setRearControlEngine,setRearLockedRoute,toggleRearCoverSleep,type RearControlEngine,type RearLockedRoute } from '../../../services/rearLyricsControl';
import { useRearLyricsSettings } from './useRearLyricsSettings';
import { rearModeLocked } from './rearControlModel';

// src/components/modal/settings/useRearSettingsController.ts
// One existing status hook for the whole index/control/advanced/guide journey.
export function useRearSettingsController(){
    const rear=useRearLyricsSettings(),{t}=useTranslation();
    const [changing,setChanging]=useState(false),[error,setError]=useState(''),lock=useRef(false),live=useRef(rear);
    live.current=rear;
    const change=async(kind:'backend'|'engine'|'route'|'cover'|'aod'|'keep-awake',value:string)=>{
        const current=live.current;
        if(lock.current||current.busy||!current.snapshot)return;
        if((kind==='backend'||kind==='engine')&&rearModeLocked(current.snapshot,false)){setError(t('rearControl.stopBeforeSwitch'));return;}
        if(kind==='route'&&current.snapshot.backendMode!=='shizuku')return;
        if(kind==='cover'&&!current.snapshot.coverSleepEnabled&&(current.snapshot.sensorAvailable!==true||current.snapshot.sleepUnsupported===true))return;
        lock.current=true;setChanging(true);setError('');
        try{
            const ok=kind==='keep-awake'?await toggleRearCardKeepAwake():kind==='aod'?await toggleRearCardAod():kind==='backend'?await setRearLyricsBackend(value as 'lsp'|'shizuku'):kind==='engine'?await setRearControlEngine(value as RearControlEngine):kind==='route'?await setRearLockedRoute(value as RearLockedRoute):await toggleRearCoverSleep();
            if(!ok)setError(t('rearBridge.failed'));
        }catch{setError(t('rearBridge.failed'));}
        finally{await rear.refresh(true);lock.current=false;setChanging(false);}
    };
    return {...rear,busy:rear.busy||changing,error,change,show:async()=>{if(lock.current)return;lock.current=true;setError('');try{await rear.toggle(true);}finally{lock.current=false;}},toggle:async()=>{if(lock.current)return;lock.current=true;setError('');try{await rear.toggle();}finally{lock.current=false;}}};
}
export type RearSettingsController=ReturnType<typeof useRearSettingsController>;
