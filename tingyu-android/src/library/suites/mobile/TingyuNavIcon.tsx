import React from 'react';

// src/library/suites/mobile/TingyuNavIcon.tsx
export type TingyuNavIconName = 'recommend' | 'library' | 'search' | 'settings';

export default function TingyuNavIcon({ name, active }: { name: TingyuNavIconName; active: boolean }) {
    return <img className="tingyu-nav-icon" src={`/assets/tingyu-nav/${name}-${active ? 'active' : 'inactive'}.svg`}
        width={24} height={24} alt="" aria-hidden="true" draggable={false} />;
}
