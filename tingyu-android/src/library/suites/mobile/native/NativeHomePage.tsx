import React from 'react';
import { useLibraryHomeOnline } from '../../../core/bindings/useLibraryHomeOnline';
import { useLibraryHomeNavidrome } from '../../../core/bindings/useLibraryHomeNavidrome';
import { resolveNavidromeCollectionType } from '../../../core/model/navidromeHomeModel';
import NativeHomeOverview, { type NativeHomeProps } from './NativeHomeOverview';
import NativeDirectoryPage from './NativeDirectoryPage';
import NativeLocalLibrary from './NativeLocalLibrary';
import type { PageActions } from '../../../../types/nativePages';

// src/library/suites/mobile/native/NativeHomePage.tsx
function OnlineLibrary(args:NativeHomeProps) {
    const {props,sources}=args;const online=useLibraryHomeOnline(props.homeResources,sources);
    return <NativeDirectoryPage {...args} key={`${sources.online.providerId}:${sources.tab}`} route={`${sources.online.providerId}:${sources.tab}`}
        cards={online.items} emptyMessage={online.emptyMessage} onOpen={card=>{void props.homeResources.actions.openOnlineCard(card,sources.online.providerId,props.onOpenGridView)}}/>;
}
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
    if(args.page==='home')return <NativeHomeOverview {...args}/>;
    if(args.sources.tab==='local')return <NativeLocalLibrary {...args}/>;
    if(args.sources.tab==='navidrome')return <NaviLibrary {...args}/>;
    return <OnlineLibrary {...args}/>;
}
