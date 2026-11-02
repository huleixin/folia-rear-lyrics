import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { NativePageModel,PageActions } from '../../../types/nativePages';
import './rearControl.css';

// src/components/modal/settings/RearControlView.tsx
// Shared semantic rows/chips; Compose consumes exactly this model with native controls.
export default function RearControlView({model,actions}:{model:NativePageModel;actions:PageActions}){
    return <div className="ty-rear-center" data-rear-page={model.key}>
        {model.sections.map(section=><div key={section.id} className="ty-settings-feature">
            {section.title&&<h2 className="ty-settings-group-title">{section.title}</h2>}
            {section.layout==='message'?<p className="ty-rear-notice" role="status">{section.text}</p>:
                section.layout==='chips'?<div role="group" aria-label={section.title} className="ty-rear-choices">{section.items?.map(item=><button key={item.id} type="button" aria-pressed={item.selected} disabled={item.disabled}
                    onClick={()=>actions[item.action!]?.({})}>{item.title}</button>)}</div>:
                    <div className="ty-settings-card">{section.items?.map(item=>item.id==='toggle'||item.id==='cover-sleep'?<div className="ty-settings-row ty-rear-switch-row" key={item.id}>
                        <span className="ty-settings-row-copy"><strong>{item.title}</strong>{item.subtitle&&<small>{item.subtitle}</small>}</span>
                        <button type="button" role="switch" aria-label={item.title} aria-checked={item.selected} disabled={item.disabled} className="ty-settings-switch"
                            onClick={()=>actions[item.action!]?.({})}><span className="ty-settings-switch-thumb"/></button>
                    </div>:item.action?<button key={item.id} type="button" className="ty-settings-row" disabled={item.disabled} onClick={()=>actions[item.action!]?.({})}>
                        <span className="ty-settings-row-copy"><strong>{item.title}</strong>{item.subtitle&&<small>{item.subtitle}</small>}</span><ChevronRight size={18}/>
                    </button>:<div className="ty-settings-row" key={item.id}><span className="ty-settings-row-copy"><strong>{item.title}</strong></span><span className="ty-rear-fact">{item.subtitle}</span></div>)}</div>}
            {section.layout!=='message'&&section.text&&<p className="ty-settings-description ty-rear-footnote">{section.text}</p>}
        </div>)}
    </div>;
}
