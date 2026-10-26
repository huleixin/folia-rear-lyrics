import React, { lazy, Suspense } from 'react';
import { useActiveLibrarySuiteId } from '../../../library/app/librarySuiteChoice';
import { useAndroidLayoutSettingsStore } from '../../../stores/useAndroidLayoutSettingsStore';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import MobileSettingsLanding from '../../modal/settings/MobileSettingsLanding';
import type SettingsModalType from '../../modal/SettingsModal';

// src/components/app/dialogs/SettingsDialogHost.tsx
const SettingsModal = lazy(() => import('../../modal/SettingsModal'));
export default function SettingsDialogHost(props: React.ComponentProps<typeof SettingsModalType>) {
    const suite = useActiveLibrarySuiteId();
    const phoneFit = useAndroidLayoutSettingsStore(state => state.phoneFitEnabled);
    const wide = useMediaQuery('(min-width: 768px)') && !phoneFit;
    const index = suite === 'mobile' && !wide && (!props.initialTab || props.initialTab === 'options')
        && !props.initialSubview && !props.initialAnchor && !props.initialVisualizerSection;
    return index ? <MobileSettingsLanding onClose={props.onClose} />
        : <Suspense fallback={suite === 'mobile' ? <MobileSettingsLanding onClose={props.onClose} /> : null}>
            <SettingsModal {...props} />
        </Suspense>;
}
