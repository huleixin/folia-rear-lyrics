import { type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useNativePage } from '../../../hooks/useNativePage';
import {buildRearControlPage,rearEntrySubtitle,type RearSettingsPage} from './rearControlModel';
import {rearControlActions} from './rearControlActions';
import type {RearSettingsController} from './useRearSettingsController';
import type { SettingsNavGroup, SettingsSectionId } from './navigation/settingsNavModel';
import type { NativePageModel, PageActions, PageSection, PageItem } from '../../../types/nativePages';

// src/components/modal/settings/useNativeSettingsPage.ts
// Same index groups and rear-display controls as MobileSettingsNavigation / AndroidRearLyricsSetting.
export function useNativeSettingsPage(root:RefObject<HTMLElement|null>,page:RearSettingsPage|'index',onClose:()=>void,onPage:(page:RearSettingsPage)=>void,
    groups:SettingsNavGroup[],onSelect:(section:SettingsSectionId)=>void,onHelp:()=>void,rear:RearSettingsController,onBack:()=>void) {
    const {t}=useTranslation();
    const actions:PageActions={close:onClose,help:onHelp,...rearControlActions(rear,onPage,onBack)};
    const sections:PageSection[]=[];
    if(rear.available)sections.push({id:'rear',layout:'rows',items:[{id:'rear-entry',title:t('rearControl.title'),subtitle:rearEntrySubtitle(rear.snapshot,rear.failed,t),action:'rear:open'}]});
    for(const group of groups){
        const items:PageItem[]=group.items.map(item=>{actions[`settings:${item.id}`]=()=>onSelect(item.id);
            return{id:item.id,title:item.label,subtitle:item.description,action:`settings:${item.id}`}});
        if(group.id==='system')items.push({id:'about',title:t('mobileSettings.about'),subtitle:t('mobileSettings.aboutDescription'),action:'help'});
        sections.push({id:group.id,title:group.label,layout:'rows',items});
    }
    // 「支持与交流」independent group. The sheet copy travels inside section.text (the rows
    // layout never renders it) so the native Compose sheets share the same i18n source.
    const supportCopy={coffeeTitle:t('mobileSettings.supportCoffeeSheetTitle'),coffeeDescription:t('mobileSettings.supportCoffeeSheetDescription'),
        channelWechat:t('mobileSettings.supportChannelWechat'),channelAlipay:t('mobileSettings.supportChannelAlipay'),
        qrMissing:t('mobileSettings.supportQrMissing'),saveQr:t('mobileSettings.supportSaveQr'),
        qrSaved:t('mobileSettings.supportQrSaved'),qrSavedAppDir:t('mobileSettings.supportQrSavedAppDir'),
        qrSaveFailed:t('mobileSettings.supportQrSaveFailed'),voluntary:t('mobileSettings.supportVoluntary'),
        communityTitle:t('mobileSettings.supportCommunitySheetTitle'),communityDescription:t('mobileSettings.supportCommunitySheetDescription'),
        groupLabel:t('mobileSettings.supportGroupLabel'),groupMissing:t('mobileSettings.supportGroupMissing'),
        joinGroup:t('mobileSettings.supportJoinGroup'),copyGroup:t('mobileSettings.supportCopyGroup'),
        groupCopied:t('mobileSettings.supportGroupCopied'),joinFallback:t('mobileSettings.supportJoinFallback')};
    sections.push({id:'support',title:t('mobileSettings.supportGroup'),layout:'rows',text:JSON.stringify(supportCopy),items:[
        {id:'coffee',title:t('mobileSettings.supportCoffee'),subtitle:t('mobileSettings.supportCoffeeDescription'),action:'support:coffee'},
        {id:'community',title:t('mobileSettings.supportCommunity'),subtitle:t('mobileSettings.supportCommunityDescription'),action:'support:group'},
    ]});
    const model:NativePageModel=page==='control'||page==='advanced'?buildRearControlPage(page,rear,t):{key:'settings:index',title:t('ui.options'),leading:'close',bottomClearance:74,sections};
    return useNativePage(root,'settings',page!=='guide'&&page!=='diagnostics'&&!page.startsWith('appearance'),model,actions);
}
