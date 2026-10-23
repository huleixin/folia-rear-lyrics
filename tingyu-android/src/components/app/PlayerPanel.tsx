import React from 'react';
import UnifiedPanel from '../UnifiedPanel';
import type { PlayerPanelViewModel } from './player-panel/buildPlayerPanelModel';
import { countRender } from '../../dev/renderCount';
import { useActiveLibrarySuiteId } from '../../library/app/librarySuiteChoice';
import MobileQueueSheet from './player-panel/MobileQueueSheet';

// App-level entry for the player side panel backed by a view model.
type PlayerPanelProps = {
    model: PlayerPanelViewModel;
};

const PlayerPanel: React.FC<PlayerPanelProps> = ({ model }) => {
    countRender('PlayerPanel');
    const mobile = useActiveLibrarySuiteId() === 'mobile';
    if (mobile && model.panelProps.playback.isOpen && model.panelProps.playback.currentTab === 'queue')
        return <MobileQueueSheet model={model} />;
    const props = mobile ? { ...model.panelProps, playback: {
        ...model.panelProps.playback,
        hideToggleButton: !model.panelProps.playback.isOpen,
        showOpenPanelCloseButton: true,
    } } : model.panelProps;
    return <UnifiedPanel {...props} />;
};

// Memoised: see the note in Home.tsx. `playerPanelModel` is the only prop, so this holds exactly
// as long as that memo does.
export default React.memo(PlayerPanel);
