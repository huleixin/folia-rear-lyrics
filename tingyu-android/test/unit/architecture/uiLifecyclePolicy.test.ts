import { expect, it } from 'vitest';
import { SETTINGS_NAV_GROUP_SPECS } from '@/components/modal/settings/navigation/settingsNavModel';
import { SETTINGS_ANCHOR_DEFINITIONS, isSettingsSubviewAvailable } from '@/components/modal/settings/navigation/settingsAnchorModel';
import { nativePageLifecycles, settingsSectionLifecycles, rearSettingsLifecycles, overlayLifecycles } from '@/services/uiLifecyclePolicy';

// test/unit/architecture/uiLifecyclePolicy.test.ts
it('registers every real settings section and anchor under a lifecycle owner',()=>{
    for(const group of SETTINGS_NAV_GROUP_SPECS) for(const section of group.sections)
        expect(settingsSectionLifecycles[section.id]).toBe(section.electronOnly?'desktop-only':!isSettingsSubviewAvailable(section.id,true)?'android-unavailable':'native-settings-flow');
    for(const anchor of Object.values(SETTINGS_ANCHOR_DEFINITIONS)) expect(settingsSectionLifecycles[anchor.section]).toBeDefined();
    expect(Object.keys(rearSettingsLifecycles)).toHaveLength(8);
    for(const policy of Object.values(nativePageLifecycles)) expect(policy).toEqual({owner:'compose-page',retention:'route-key',exit:'native-host'});
    expect(overlayLifecycles.settingsModal.authority).toBe('current-modal-key');
});
