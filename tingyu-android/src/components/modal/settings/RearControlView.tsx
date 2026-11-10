import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { NativePageModel,PageActions } from '../../../types/nativePages';
import './rearControl.css';

// src/components/modal/settings/RearControlView.tsx
// Shared semantic rows/chips; Compose consumes exactly this model with native controls.
export default function RearControlView({model,actions}:{model:NativePageModel;actions:PageActions}){
    return <div className="ty-rear-center" data-rear-page={model.key} data-settings-layout="column">
        {model.sections.map(section=><div key={section.id} className="ty-settings-feature" data-settings-style='{"margin":[0,0,0,16]}' data-settings-layout="column">
            {section.title&&<h2 className="ty-settings-group-title" data-settings-style='{"gap":10,"font":13,"weight":500,"tone":"muted","margin":[2,0,2,8]}' data-settings-layout="row">{section.title}</h2>}
            {section.layout==='message'?<p className="ty-rear-notice" role="status" data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="wrap">{section.text}</p>:
                section.layout==='chips'?<div role="group" aria-label={section.title} className="ty-rear-choices" data-settings-style='{"gap":4,"padding":[4,4,4,4],"radius":14,"border":true}' data-settings-layout="segment">{section.items?.map(item=><button key={item.id} type="button" aria-pressed={item.selected} disabled={item.disabled}
                    onClick={()=>actions[item.action!]?.({})} data-settings-layout="row">{item.title}</button>)}</div>:
                    <div className="ty-settings-card" data-settings-style='{"border":true,"radius":14}' data-settings-layout="card">{section.items?.map(item=>['toggle','cover-sleep','aod','keep-awake'].includes(item.id)?<div className="ty-settings-row ty-rear-switch-row" key={item.id} data-settings-style='{"align":"center","gap":12,"padding":[14,8,14,8],"minHeight":48}' data-settings-layout="row">
                        <span className="ty-settings-row-copy" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column"><strong data-settings-layout="wrap">{item.title}</strong>{item.subtitle&&<small data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="wrap">{item.subtitle}</small>}</span>
                        <button type="button" role="switch" aria-label={item.title} aria-checked={item.selected} disabled={item.disabled} className="ty-settings-switch"
                            onClick={()=>actions[item.action!]?.({})} data-settings-layout="row"><span className="ty-settings-switch-thumb" data-settings-layout="wrap"/></button>
                    </div>:item.action?<button key={item.id} type="button" className="ty-settings-row" disabled={item.disabled} onClick={()=>actions[item.action!]?.({})} data-settings-style='{"align":"center","gap":12,"padding":[14,8,14,8],"minHeight":48}' data-settings-layout="row">
                        <span className="ty-settings-row-copy" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column"><strong data-settings-layout="wrap">{item.title}</strong>{item.subtitle&&<small data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="wrap">{item.subtitle}</small>}</span><ChevronRight size={18}/>
                    </button>:<div className="ty-settings-row" key={item.id} data-settings-style='{"align":"center","gap":12,"padding":[14,8,14,8],"minHeight":48}' data-settings-layout="row"><span className="ty-settings-row-copy" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column"><strong data-settings-layout="wrap">{item.title}</strong></span><span className="ty-rear-fact" data-settings-style='{"font":13,"tone":"muted"}' data-settings-layout="wrap">{item.subtitle}</span></div>)}</div>}
            {section.layout!=='message'&&section.text&&<p className="ty-settings-description ty-rear-footnote" data-settings-style='{"font":12,"tone":"muted","margin":[2,8,2,0]}' data-settings-layout="wrap">{section.text}</p>}
        </div>)}
    </div>;
}
