import {create} from 'zustand';

// src/services/feedback/navigation.ts: durable request survives lazy settings mount.
export const useFeedbackNavigation=create<{open:boolean;crash:boolean;close:()=>void}>(set=>({open:false,crash:false,close:()=>set({open:false,crash:false})}));
export async function openFeedback(crash=false){useFeedbackNavigation.setState({open:true,crash});const {useSettingsModalStore}=await import('../../stores/useSettingsModalStore');useSettingsModalStore.getState().openSettings('help');return true;}
