import React from 'react';
import {AnimatePresence} from 'framer-motion';
import {NATIVE_FIRST} from '../../../services/nativePages';

// src/components/modal/settings/SettingsPresence.tsx
// Native owns transitions. Retaining exiting HTML editors would republish their old layout.
export default function SettingsPresence(props:React.ComponentProps<typeof AnimatePresence>){
    return NATIVE_FIRST?<>{React.Children.map(props.children,child=>React.isValidElement(child)&&'animate' in (child.props as object)
        ?React.cloneElement(child as React.ReactElement<Record<string,unknown>>,{initial:false,transition:{duration:0}}):child)}</>:<AnimatePresence {...props}/>;
}
