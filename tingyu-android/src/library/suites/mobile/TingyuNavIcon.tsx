import React from 'react';
import { useInterfaceLight } from '../../../hooks/useInterfaceAppearance';

// src/library/suites/mobile/TingyuNavIcon.tsx
export type TingyuNavIconName = 'recommend' | 'library' | 'search' | 'settings';

export default function TingyuNavIcon({ name, active }: { name: TingyuNavIconName; active: boolean }) {
    const light=useInterfaceLight();
    return <img className="tingyu-nav-icon" src={`/assets/tingyu-nav/${light ? 'light/' : ''}${name}-${active ? 'active' : 'inactive'}.svg`}
        width={24} height={24} alt="" aria-hidden="true" draggable={false} />;
}
