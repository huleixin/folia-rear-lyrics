import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryHomeCard } from '../../../core/contracts/homeModel';
import type { NativeHomeProps } from './NativeHomeOverview';
import type { NativePageModel, PageActions, PageSection } from '../../../../types/nativePages';
import { useNativePage } from '../../../../hooks/useNativePage';
import { absolutePageImage } from '../../../../services/nativePages';
import { directoryRows, directoryContentTabs, canSortDirectoryByUpdate, type DirectorySort } from '../mobileDirectoryModel';
import { pageRowActions } from '../../../../utils/nativePageActions';
import { useHomeSourceStore } from '../../../../stores/useHomeSourceStore';

// src/library/suites/mobile/native/NativeDirectoryPage.tsx
export default function NativeDirectoryPage({root,props,sources,onReady,onSources,cards,onOpen,sections=[],tailSections=[],onFilter,extraActions={},emptyMessage,route,heading,enableSort=false,headingTrailing='',headingTrailingLabel=''}:NativeHomeProps&{
    cards:LibraryHomeCard[];onOpen:(card:LibraryHomeCard,index:number)=>void;sections?:PageSection[];extraActions?:PageActions;emptyMessage:string;route:string;heading?:string;enableSort?:boolean;
    tailSections?:PageSection[];onFilter?:(query:string)=>void;
    /** 本地资料库专用：标题右上角的「更多」入口（导入/刷新收纳在同一个工具面板里）。 */
    headingTrailing?:string;headingTrailingLabel?:string;
}) {
    const {t}=useTranslation();const [query,setQuery]=useState(''),[sort,setSort]=useState<DirectorySort>('source'),[offset,setOffset]=useState(0);
    const localMode=useHomeSourceStore(state=>state.source)==='local';
    const rows=useMemo(()=>directoryRows(cards,query,sort),[cards,query,sort]);
    const actions:PageActions={...extraActions,sources:onSources,filter:e=>{setQuery(e.text??'');onFilter?.(e.text??'');setOffset(0)},range:e=>setOffset(Math.max(0,Math.floor((e.value??0)/100)*100))};
    // Source selection belongs to the header. Only supported content categories remain here;
    // local/Navidrome keep their own sections and all existing import/connection actions.
    const tabs:PageSection|null=localMode||sources.tab==='navidrome'?null:{id:'sources',layout:'chips',items:directoryContentTabs(sources.tabs).map(tab=>{
        const key=`source:${tab.key}`;
        // Category changes stay in the current online source; playback remains untouched.
        actions[key]=()=>{sources.setTab(tab.key);useHomeSourceStore.getState().setSource('online')};
        return{id:key,title:tab.label,action:key,selected:sources.tab===tab.key,disabled:!!tab.disabledReason};
    })};
    if(tabs)for(const extra of props.extraTabs??[]){actions[`extra:${extra.id}`]=extra.select;tabs.items!.push({id:extra.id,title:extra.label,action:`extra:${extra.id}`})}
    const orders:DirectorySort[]=canSortDirectoryByUpdate(cards)?['source','name','updated']:['source','name'];
    const sorting:PageSection={id:'sort',title:heading,layout:'chips',items:enableSort?orders.map(order=>{
        actions[`sort:${order}`]=()=>{setSort(order);setOffset(0)};
        return{id:order,title:t(order==='source'?'mobileLibrary.sourceOrder':order==='name'?'mobileLibrary.nameOrder':'mobileLibrary.recentlyUpdated'),action:`sort:${order}`,selected:sort===order};
    }):[]};
    const items=rows.slice(offset,offset+100).map(({card,index})=>{
        const key=`open:${index}:${card.id}`;actions[key]=()=>onOpen(card,index);
        return{id:key,title:card.name,subtitle:card.trackCount!=null?t('mobileLibrary.trackCount',{count:card.trackCount}):card.description,image:absolutePageImage(card.coverUrl),action:key};
    });
    // Every library retains a source exit, including local. Its existing tools remain a separate
    // compact header action, and bottom clearance still protects the final song from floating chrome.
    const model:NativePageModel={key:`library:${route}`,title:t('mobileLibrary.libraryTitle'),
        trailing:'sources',trailingLabel:localMode?t('mobileLibrary.localMusicSource'):sources.tab==='navidrome'?'Navidrome':sources.online.providerLabel,
        trailingIcon:localMode?'smartphone':'',
        bottomClearance:localMode?172:152,sections:[...(headingTrailing?[{id:'library-tools',layout:'message' as const,action:headingTrailing,title:headingTrailingLabel}]:[]),...(tabs?[tabs]:[]),...sections,{id:'filter',layout:'input',value:query,placeholder:t('mobileLibrary.filterLibrary'),action:'filter'},...(heading||enableSort?[sorting]:[]),
            {id:'directory',key:`${query}:${sort}`,layout:'rows',items,total:rows.length,offset,request:'range'},...tailSections,...(!rows.length&&!tailSections.some(s=>s.total||s.items?.length)?[{id:'empty',layout:'message' as const,text:query?t('home.noResults'):emptyMessage}]:[])]};
    const bound=pageRowActions(actions,id=>{
        const match=/^open:(\d+):(.*)$/.exec(id);if(!match)return;
        const index=Number(match[1]),card=cards[index];if(!card||String(card.id)!==match[2])return;
        return()=>onOpen(card,index);
    });
    useNativePage(root,'home',props.isInteractive,model,bound,onReady);return null;
}
