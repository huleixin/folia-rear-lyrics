import React, { lazy, Suspense, useEffect } from 'react';
import { useActiveLibrarySuiteId } from '../../../library/app/librarySuiteChoice';
import { useAndroidLayoutSettingsStore } from '../../../stores/useAndroidLayoutSettingsStore';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import MobileSettingsLanding from '../../modal/settings/MobileSettingsLanding';
import PlatformAccountsPage from '../../modal/settings/PlatformAccountsPage';
import DiscoverySettingsPage from '../../modal/settings/DiscoverySettingsPage';
import SearchSettingsPage from '../../modal/settings/SearchSettingsPage';
import type SettingsModalType from '../../modal/SettingsModal';
import { NATIVE_FIRST } from '../../../services/nativePages';
import { loadSettingsModule, peekSettingsModule, scheduleSettingsWarmup } from './settingsModule';
import NativeSettingsLoading from '../../modal/settings/NativeSettingsLoading';
import { useTabletSettingsDualPane } from '../../modal/settings/settingsSplitNavigation';

// src/components/app/dialogs/SettingsDialogHost.tsx
const SettingsModal = lazy(loadSettingsModule);
export default function SettingsDialogHost(props: React.ComponentProps<typeof SettingsModalType>) {
    useEffect(scheduleSettingsWarmup, []);
    const suite = useActiveLibrarySuiteId();
    const phoneFit = useAndroidLayoutSettingsStore(state => state.phoneFitEnabled);
    const returnToIndex = useSettingsModalStore(state => state.settingsModalState.returnToIndex);
    const subviewBackStack = useSettingsModalStore(state => state.settingsModalState.subviewBackStack);
    const dualPane = useTabletSettingsDualPane();
    const wide = useMediaQuery('(min-width: 768px)') && !phoneFit;
    const index = suite === 'mobile' && (!wide||NATIVE_FIRST) && (!props.initialTab || props.initialTab === 'options')
        && !props.initialSubview && !props.initialAnchor && !props.initialVisualizerSection;
    const ResolvedSettingsModal = peekSettingsModule()?.default ?? SettingsModal;
    if (props.initialSubview === 'accounts') {
        const subviewStackLen = subviewBackStack?.length ?? 0;
        const nativeAccountsSplitPane = NATIVE_FIRST && dualPane && (Boolean(returnToIndex) || subviewStackLen > 0);
        if (nativeAccountsSplitPane) {
            return <PlatformAccountsPage onClose={props.onClose} />;
        }
        const parent = subviewBackStack?.at(-1);
        let underlay: React.ReactNode = null;
        if (parent?.initialSubview === 'discovery') {
            underlay = <DiscoverySettingsPage onClose={props.onClose}/>;
        } else if (parent?.initialSubview === 'search') {
            underlay = <SearchSettingsPage onClose={props.onClose}/>;
        } else if (returnToIndex && (!parent || (parent.initialTab === 'options' && !parent.initialSubview)) && suite === 'mobile' && (!wide || NATIVE_FIRST)) {
            underlay = <MobileSettingsLanding onClose={props.onClose} />;
        }
        return (
            <>
                {underlay}
                <PlatformAccountsPage onClose={props.onClose}/>
            </>
        );
    }
    if (props.initialSubview === 'search') return <SearchSettingsPage onClose={props.onClose}/>;
    if (props.initialSubview === 'discovery') return <DiscoverySettingsPage onClose={props.onClose}/>;
    return index ? <MobileSettingsLanding onClose={props.onClose} />
        : <Suspense fallback={NATIVE_FIRST?<NativeSettingsLoading section={props.initialSubview} onClose={props.onClose}/>:suite === 'mobile' ? <MobileSettingsLanding onClose={props.onClose} /> : null}>
            <ResolvedSettingsModal {...props} />
        </Suspense>;
}
