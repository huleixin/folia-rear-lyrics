// src/utils/nativeShellState.ts
export function nativeShellRoute(state: {
    settingsOpen:boolean; settingsIndex:boolean; searchOpen:boolean; collectionOpen:boolean;
    view:string; libraryPage:string;
}) {
    return {
        route:state.settingsOpen?'settings'
            :state.searchOpen&&!state.collectionOpen?'search':state.collectionOpen?'collection'
                :state.view==='player'?'stage':state.view==='home'?'home':'web',
        selectedTab:state.libraryPage==='library'?1:0,
    };
}
export function nativeShellHasWebOverlay(nodes:Iterable<HTMLElement>) {
    return [...nodes].some(node=>node.dataset.nativePage!=='true'
        &&!node.querySelector('[data-native-page="true"]')&&node.dataset.nativeChromeOverlay!=='nonblocking');
}
