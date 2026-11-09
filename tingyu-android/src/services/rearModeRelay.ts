import {getRearModeReceipt,type RearModeReceipt} from './rearAodRuntime';

// src/services/rearModeRelay.ts
// Same-origin LSP iframe mode replay, including HIDDEN; acknowledgments are not presentation evidence.
type ModeWindow=Window&{__foliaRearModeReceipt?:RearModeReceipt};
export function createRearModeRelay(frame:()=>Window|null|undefined,host:Window=window){
    let lastReport='';
    const replay=()=>{
        const receipt=getRearModeReceipt();
        if(receipt.sequence<0)return;
        let applied=false,frameHidden=false;
        try{
            const child=frame() as ModeWindow|null|undefined;
            child?.dispatchEvent(new CustomEvent('folia-rear-mode',{detail:receipt}));
            applied=child?.__foliaRearModeReceipt?.sequence===receipt.sequence&&child.__foliaRearModeReceipt.mode===receipt.mode;
            frameHidden=child?.document?.hidden===true;
        }catch{/* A navigating iframe replays on load; never start a retry timer. */}
        const key=receipt.mode+':'+receipt.sequence+':'+applied;
        if(host.location.hostname==='rear.folia.local'&&lastReport!==key){
            lastReport=key;
            const query=new URLSearchParams({mode:receipt.mode,sequence:String(receipt.sequence),iframe:String(applied),hidden:String(host.document.hidden),iframeHidden:String(frameHidden)});
            void host.fetch('/__folia_rear/mode-report?'+query,{cache:'no-store'}).catch(()=>undefined);
        }
    };
    host.addEventListener('folia-rear-mode',replay);
    replay();
    return {replay,dispose:()=>host.removeEventListener('folia-rear-mode',replay)};
}
