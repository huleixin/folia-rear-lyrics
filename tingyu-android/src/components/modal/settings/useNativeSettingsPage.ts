import { useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useNativePage } from '../../../hooks/useNativePage';
import { absolutePageImage } from '../../../services/nativePages';
import { setRearLyricsBackend } from '../../../services/rearLyricsControl';
import { useRearLyricsSettings } from './useRearLyricsSettings';
import { rearSettingsCanToggle, rearSettingsState, rearSettingsHint, rearSettingsLabelKey } from './rearLyricsSettingsModel';
import type { SettingsNavGroup, SettingsSectionId } from './navigation/settingsNavModel';
import type { NativePageModel, PageActions, PageSection, PageItem } from '../../../types/nativePages';
import rearDecoration from '../../../../assets/tingyu/xiaomi-backscreen-decoration.webp';

// src/components/modal/settings/useNativeSettingsPage.ts
// Same index groups and rear-display controls as MobileSettingsNavigation / AndroidRearLyricsSetting.
export function useNativeSettingsPage(root:RefObject<HTMLElement|null>,guide:boolean,onClose:()=>void,onGuide:()=>void,
    groups:SettingsNavGroup[],onSelect:(section:SettingsSectionId)=>void,onHelp:()=>void) {
    const {t}=useTranslation(),rear=useRearLyricsSettings(!guide);
    const [backendBusy,setBackendBusy]=useState(false),[backendFailed,setBackendFailed]=useState(false);
    const pending=useRef(false),snapshot=rear.snapshot;
    const change=async(mode:'lsp'|'shizuku')=>{
        if(pending.current||!snapshot||snapshot.enabled||snapshot.starting||snapshot.sleeping)return;
        pending.current=true;setBackendBusy(true);setBackendFailed(false);
        try{if(!await setRearLyricsBackend(mode))setBackendFailed(true);await rear.refresh()}
        catch{setBackendFailed(true)}finally{pending.current=false;setBackendBusy(false)}
    };
    const actions:PageActions={close:onClose,guide:onGuide,help:onHelp,rear:()=>{void rear.toggle()},refresh:()=>{void rear.refresh()},
        'backend:lsp':()=>{void change('lsp')},'backend:shizuku':()=>{void change('shizuku')}};
    const sections:PageSection[]=[];
    if(rear.available){
        const state=rearSettingsState(snapshot,rear.failed),hint=rearSettingsHint(snapshot);
        const revision=snapshot?.build==null?'':`r${String(snapshot.build).replace(/^r/i,'')}`;
        const adaptation=[revision,(snapshot?.rearDisplayId??-1)>=0?t('options.rearLyricsDetected',{id:snapshot?.rearDisplayId}):
            t(rearSettingsLabelKey(rear.failed?'failed':typeof snapshot?.rearDisplayId==='number'&&snapshot.rearDisplayId<0?'unsupported':'detecting'))].filter(Boolean).join(' · ');
        const backendDisabled=!snapshot||backendBusy||snapshot.enabled||snapshot.starting||snapshot.sleeping;
        const statusHint=[hint?t(hint):'',rear.actionFailed?t('mobileSettings.rearActionFailed'):'',backendFailed?t('rearBridge.failed'):'',
            snapshot?.backendMode==='lsp'?(snapshot.lspConnected?t('rearBridge.connected'):snapshot.lspDetail??''):''].filter(Boolean).join('\n');
        sections.push({id:'rear',title:t('options.rearLyricsTitle'),layout:'rows',image:absolutePageImage(rearDecoration),text:statusHint,items:[
            {id:'toggle',title:t('options.rearLyricsTitle'),subtitle:t('mobileSettings.rearDescription'),secondaryLabel:t(snapshot?.enabled?'options.rearLyricsReturn':'mobileSettings.rearEnable'),
                action:'rear',disabled:rear.failed||!rearSettingsCanToggle(snapshot,rear.busy),selected:snapshot?.enabled===true},
            {id:'adaptation',title:t('mobileSettings.rearAdaptation'),subtitle:adaptation},
            {id:'state',title:t('mobileSettings.currentStatus'),subtitle:t(rearSettingsLabelKey(state)),selected:state==='enabled'||state==='disabled'||state==='system',
                secondary:rear.failed?'refresh':undefined,secondaryLabel:t('mobileSettings.retryDetection')},
            {id:'mode',title:t('rearBridge.mode'),subtitle:snapshot?.backendMode==='lsp'?'LSP / LSPosed':'Shizuku',disabled:!!backendDisabled},
            {id:'switchHint',title:'',subtitle:t('rearBridge.switchHint')},
            {id:'backendHelp',title:t('rearBridge.help'),subtitle:[t('rearBridge.setup'),t('rearBridge.behavior'),t('rearBridge.lyricInfo')].join('\n\n')},
            {id:'guide',title:t('mobileSettings.startupGuide'),subtitle:t('mobileSettings.startupGuideDescription'),action:'guide'},
        ]});
    }
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
    const model:NativePageModel={key:'settings:index',title:t('ui.options'),leading:'close',bottomClearance:24,sections};
    return useNativePage(root,'settings',!guide,model,actions);
}
