import React from 'react';
import {useTranslation} from 'react-i18next';
import type {PageActions} from '../../../types/nativePages';
import type {RearSettingsController} from './useRearSettingsController';
import {buildRearControlPage} from './rearControlModel';
import RearControlView from './RearControlView';

// src/components/modal/settings/RearBridgeSettings.tsx
// Advanced options reuse the native model; backend-specific routes cannot leak into the other mode.
export default function RearBridgeSettings({rear,actions}:{rear:RearSettingsController;actions:PageActions}){
    const {t}=useTranslation();return <RearControlView model={buildRearControlPage('advanced',rear,t)} actions={actions}/>;
}
