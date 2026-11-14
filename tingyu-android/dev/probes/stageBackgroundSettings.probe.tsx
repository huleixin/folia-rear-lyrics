import React, { useEffect, useState } from "react";
import { MonetBackgroundSettingsCard } from "../../src/components/visualizer/backgrounds/monet/MonetBackgroundSettingsCard";
import NomandBackgroundSettingsCard from "../../src/components/visualizer/backgrounds/nomand/NomandBackgroundSettingsCard";
import LatentBackgroundSettingsCard from "../../src/components/visualizer/backgrounds/latent/LatentBackgroundSettingsCard";
import MonetBackgroundLayer from "../../src/components/visualizer/backgrounds/monet/MonetBackgroundLayer";
import { useVisualizerSettingsStore } from "../../src/stores/useVisualizerSettingsStore";
import { useVisualizerAssetStore } from "../../src/stores/useVisualizerAssetStore";
import { getMonetBackgroundImage } from "../../src/services/monetBackgroundImage";
import { DEFAULT_LATENT_BACKGROUND_TUNING } from "../../src/types";
import { DAYLIGHT_THEME } from "../../src/services/baseThemes";
import type { ProbeDefinition } from "./definition";

// Real React handlers, native semantic actions and IndexedDB restoration without the whole app.
const StageBackgroundSettingsProbe: React.FC = () => {
    const settings=useVisualizerSettingsStore();
    const assets=useVisualizerAssetStore();
    const [latent,setLatent]=useState(DEFAULT_LATENT_BACKGROUND_TUNING);
    useEffect(() => {
        let disposed=false;
        void getMonetBackgroundImage().then(image => {
            if(disposed)return;
            useVisualizerAssetStore.setState({storedMonetBackgroundImage:image,
                monetBackgroundImage:image ? {id:image.id,name:image.name,url:URL.createObjectURL(image.blob)} : null,
                isLoadingMonetBackgroundImage:false});
        });
        return () => {disposed=true;};
    },[]);
    const common={t:(key:string)=>key,isDaylight:true,theme:DAYLIGHT_THEME,controlCardBg:DAYLIGHT_THEME.backgroundColor,rangeInputClass:"w-full"};
    const imageProps={monetBackgroundImage:assets.monetBackgroundImage,isLoadingMonetBackgroundImage:assets.isLoadingMonetBackgroundImage,
        onUploadMonetBackgroundImage:settings.handleUploadMonetBackgroundImage,onClearMonetBackgroundImage:settings.handleClearMonetBackgroundImage};
    return <div style={{color:DAYLIGHT_THEME.primaryColor,background:DAYLIGHT_THEME.backgroundColor,padding:16}}>
        <div data-testid="monet">
            <MonetBackgroundSettingsCard {...common} {...imageProps} tuning={settings.monetBackgroundTuning} onTuningChange={settings.handleSetMonetBackgroundTuning}/>
        </div>
        <div data-testid="nomand">
            <NomandBackgroundSettingsCard {...common} {...imageProps} tuning={settings.nomandBackgroundTuning} onTuningChange={settings.handleSetNomandBackgroundTuning}/>
        </div>
        <div data-testid="latent">
            <LatentBackgroundSettingsCard {...common} tuning={latent} onTuningChange={patch=>setLatent(prev=>({...prev,...patch}))}/>
        </div>
        <div data-testid="preview" style={{position:"relative",width:240,height:240}}>
            <MonetBackgroundLayer theme={DAYLIGHT_THEME} isDaylight monetBackgroundImage={assets.monetBackgroundImage} tuning={settings.monetBackgroundTuning} staticMode/>
        </div>
        {assets.monetBackgroundImage && <img data-testid="uploaded-image" src={assets.monetBackgroundImage.url} alt="Uploaded image" width={64}/>}
    </div>;
};
const probe: ProbeDefinition={id:"stageBackgroundSettings",title:"Stage background settings",description:"Checks selected semantics and native image upload persistence.",Component:StageBackgroundSettingsProbe};
export default probe;
