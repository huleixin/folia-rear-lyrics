import { rearPageKey } from '../components/modal/settings/rearControlModel';
import { resolveInitialSettingsSection } from '../components/modal/settings/navigation/settingsLastSection';
import type { SettingsModalState } from '../stores/useSettingsModalStore';

// src/utils/nativeShellState.ts
export function isTabletSettingsDualPane(): boolean {
    if (typeof window === 'undefined') return false;
    const width = window.innerWidth || 0;
    const height = window.innerHeight || 0;
    const contentWidth = width >= 840 ? width - 104 : width;
    return contentWidth >= 680 && height >= 420;
}

export function resolveSettingsOverlayBacking(settings: SettingsModalState, dualPane = false): {
    settingsOwnsRoute: boolean;
    settingsIndex: boolean;
    pageTarget: string;
} {
    if (!settings.isOpen) {
        return { settingsOwnsRoute: false, settingsIndex: false, pageTarget: '' };
    }

    // 「音乐平台账号」在手机端或无设置上下文时为 WebView 覆盖层：底板保持来源页；
    // 平板分栏（dualPane=true）下在右侧设置容器内以原生详情页直接呈现。
    if (settings.initialSubview === 'accounts') {
        const parent = settings.subviewBackStack?.at(-1);
        if (dualPane && (settings.returnToIndex || Boolean(parent))) {
            return {
                settingsOwnsRoute: true,
                settingsIndex: false,
                pageTarget: 'settings:document:accounts',
            };
        }
        if (!parent) {
            if (settings.returnToIndex) {
                return {
                    settingsOwnsRoute: true,
                    settingsIndex: true,
                    pageTarget: rearPageKey(settings.rearPage ?? 'index'),
                };
            }
            // 从推荐页 / 资料库等非设置入口直达账号页时，保持原一级浏览路由在底板不变
            return { settingsOwnsRoute: false, settingsIndex: false, pageTarget: '' };
        }
        const parentIsIndex = parent.initialTab === 'options' && !parent.initialSubview;
        if (parentIsIndex) {
            return {
                settingsOwnsRoute: true,
                settingsIndex: true,
                pageTarget: rearPageKey(settings.rearPage ?? 'index'),
            };
        }
        if (parent.initialSubview === 'discovery' || parent.initialSubview === 'search') {
            return {
                settingsOwnsRoute: true,
                settingsIndex: false,
                pageTarget: `settings:document:${parent.initialSubview}`,
            };
        }
        const sec = resolveInitialSettingsSection({
            initialSubview: parent.initialSubview ?? null,
            hasInitialAnchor: false,
            isElectron: false,
        });
        return {
            settingsOwnsRoute: true,
            settingsIndex: false,
            pageTarget: `settings:document:${parent.initialTab}:${sec}:`,
        };
    }

    const index = settings.initialTab === 'options'
        && !settings.initialSubview
        && !settings.initialAnchor
        && !settings.initialVisualizerSection;
    if (index) {
        return {
            settingsOwnsRoute: true,
            settingsIndex: true,
            pageTarget: rearPageKey(settings.rearPage ?? 'index'),
        };
    }
    if (settings.initialSubview === 'discovery' || settings.initialSubview === 'search') {
        return {
            settingsOwnsRoute: true,
            settingsIndex: false,
            pageTarget: `settings:document:${settings.initialSubview}`,
        };
    }
    const sec = resolveInitialSettingsSection({
        initialSubview: settings.initialSubview ?? null,
        hasInitialAnchor: !!settings.initialAnchor,
        isElectron: false,
    });
    return {
        settingsOwnsRoute: true,
        settingsIndex: false,
        pageTarget: `settings:document:${settings.initialTab}:${sec}:`,
    };
}

export function nativeShellRoute(state: {
    settingsOpen:boolean; settingsIndex:boolean; searchOpen:boolean; collectionOpen:boolean;
    view:string; libraryPage:string;
}) {
    return {
        route:state.settingsOpen?'settings'
            :state.view==='player'?'stage':state.searchOpen&&!state.collectionOpen?'search':state.collectionOpen?'collection'
                :state.view==='home'?'home':'web',
        selectedTab:state.libraryPage==='library'?1:0,
    };
}
export function nativeShellHasWebOverlay(nodes:Iterable<HTMLElement>) {
    return [...nodes].some(node=>node.dataset.nativePage!=='true'
        &&!node.querySelector('[data-native-page="true"]')&&node.dataset.nativeChromeOverlay!=='nonblocking');
}
