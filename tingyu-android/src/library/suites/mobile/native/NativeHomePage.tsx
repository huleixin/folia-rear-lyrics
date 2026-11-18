import React from 'react';
import { useLibraryHomeNavidrome } from '../../../core/bindings/useLibraryHomeNavidrome';
import { resolveNavidromeCollectionType } from '../../../core/model/navidromeHomeModel';
import type { NativeHomeProps } from './NativeHomeOverview';
import NativeDiscoveryHome from './discovery/NativeDiscoveryHome';
import NativeDirectoryPage from './NativeDirectoryPage';
import type { PageActions } from '../../../../types/nativePages';
import NativeUnifiedLibrary from './NativeUnifiedLibrary';

// src/library/suites/mobile/native/NativeHomePage.tsx
function NaviLibrary(args:NativeHomeProps) {
    const {props}=args;const model=useLibraryHomeNavidrome(props.homeResources.navidromeOverview);
    const actions:PageActions={refresh:()=>{void model.refresh()}};
    const items=model.sections.map(section=>{actions[`navi:${section.key}`]=()=>model.setSection(section.key);
        return{id:section.key,title:section.label,selected:section.active,action:`navi:${section.key}`}});
    return <NativeDirectoryPage {...args} key={model.section} route={`navidrome:${model.section}`} cards={model.items}
        extraActions={actions} sections={[{id:'navi-sections',layout:'chips',items},{id:'refresh',layout:'message',more:'refresh',moreLabel:'刷新'}]}
        emptyMessage={model.emptyMessage} onOpen={card=>{void props.homeResources.actions.openNavidromeCard(card,resolveNavidromeCollectionType(model.section,card.id),props.onOpenGridView)}}/>;
}
export default function NativeHomePage(args:NativeHomeProps&{page:'home'|'library'}) {
    // 一级页面固定为新版综合推荐与多平台资料库（Navidrome 除外），永不切换为旧版全局本地音乐模式；
    // 本地音乐通过独立二级页面或推荐页独立「本地音乐」筛选项访问。
    if(args.page==='home')return <NativeDiscoveryHome {...args}/>;
    if(args.sources.tab==='navidrome')return <NaviLibrary {...args}/>;
    return <NativeUnifiedLibrary {...args}/>;
}
