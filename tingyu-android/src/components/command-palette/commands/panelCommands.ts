import { ListMusic } from 'lucide-react';
import type { CommandPaletteCommand } from '../types';
import { createPanelCommand } from '../commandFactories';

// src/components/command-palette/commands/panelCommands.ts
// Commands in the `panel` group: opening the unified side panel on a given tab.

export const panelCommands: CommandPaletteCommand[] = [
    createPanelCommand('cover', 'Panel: cover', 'Open the cover panel tab', ['cover panel', '封面'], undefined, { executeShortcut: 'c' }),
    createPanelCommand('queue', 'Panel: queue', 'Open the queue panel tab', ['queue panel', '队列'], ListMusic),
    createPanelCommand('onlineLyrics', 'Panel: lyrics', 'Open the online lyrics panel tab', ['lyrics panel', '歌词面板']),
];
