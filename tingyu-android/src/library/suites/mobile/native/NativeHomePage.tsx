import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryHomeOnline } from '../../../core/bindings/useLibraryHomeOnline';
import { useLibraryHomeNavidrome } from '../../../core/bindings/useLibraryHomeNavidrome';
import { resolveNavidromeCollectionType } from '../../../core/model/navidromeHomeModel';
import NativeHomeOverview, { type NativeHomeProps } from './NativeHomeOverview';
import NativeDirectoryPage from './NativeDirectoryPage';
import NativeLocalLibrary from './NativeLocalLibrary';
import NativeLocalHomeOverview from './NativeLocalHomeOverview';
import { useHomeSourceStore } from '../../../../stores/useHomeSourceStore';
import type { PageActions } from '../../../../types/nativePages';
import { directoryContentTabs } from '../mobileDirectoryModel';

// src/library/suites/mobile/native/NativeHomePage.tsx
function OnlineLibrary(args:NativeHomeProps) {
    const {props,sources}=args;const online=useLibraryHomeOnline(props.homeResources,sources);
    const {t}=useTranslation();
    const tabs=useMemo(()=>directoryContentTabs(sources.tabs),[sources.tabs]);
    const valid=!tabs.length||tabs.some(tab=>tab.key===sources.tab);
    useEffect(()=>{if(!valid)sources.setTab(tabs[0].key)},[valid,tabs,sources.setTab]);
    if(!valid)return null;
    return <NativeDirectoryPage {...args} key={`${sources.online.providerId}:${sources.tab}`} route={`${sources.online.providerId}:${sources.tab}`}
        cards={online.items} heading={sources.tab==='playlist'?t('mobileLibrary.myPlaylists'):online.title} enableSort={sources.tab==='playlist'} emptyMessage={online.emptyMessage} onOpen={card=>{void props.homeResources.actions.openOnlineCard(card,sources.online.providerId,props.onOpenGridView)}}/>;
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
    // 推荐页按「音源」切换内容：本地音乐 → 本地推荐首页，在线 → 原来的推荐首页。
    // 只换首页数据源；播放器、迷你条与队列不归它管，切来源不打断播放。
    const homeSource=useHomeSourceStore(state=>state.source);
    if(args.page==='home')return homeSource==='local'?<NativeLocalHomeOverview {...args}/>:<NativeHomeOverview {...args}/>;
    // 资料库以全局音源为准：选了「本地音乐」就直接进本地曲库，不再让旧的在线页签残留
    // （homeViewTab 由 useHomeSourceStore.setSource 同步，但旧版本持久化可能不一致）。
    if(homeSource==='local')return <NativeLocalLibrary {...args}/>;
    if(args.sources.tab==='local')return <NativeLocalLibrary {...args}/>;
    if(args.sources.tab==='navidrome')return <NaviLibrary {...args}/>;
    return <OnlineLibrary {...args}/>;
}
