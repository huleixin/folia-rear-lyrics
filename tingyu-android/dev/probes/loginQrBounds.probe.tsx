import React,{useState} from 'react';
import OnlineProviderLoginModal from '../../src/library/suites/mobile/account/OnlineProviderLoginModal';
import type {ProbeDefinition} from './definition';
// The real login modal with a synthetic layout-only image; never starts an account request.
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="white"/><path d="M80 80h320v320H80zM624 80h320v320H624zM80 624h320v320H80zM500 500h140v140H500zM760 720h184v224H760z" fill="black"/></svg>');
function Probe(){
    const [open,setOpen]=useState(true);
    return open?<OnlineProviderLoginModal title="Layout test" note="Synthetic image, no login" qrCodeImg={image} statusText="Waiting" state="waiting" retryLabel="Retry" closeLabel="Close login" onRetry={()=>{}} onClose={()=>setOpen(false)}/>:<p>Closed</p>;
}
export default {id:'loginQrBounds',title:'Login QR bounds',description:'Large fonts and small windows',Component:Probe} satisfies ProbeDefinition;
