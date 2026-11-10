import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// dev/build/generateInterfaceThemes.mjs
// One reviewed source owns native colors, WebView recipes and synchronous startup paint.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'src/theme/interfaceThemeSpec.json'),'utf8'));
const check=process.argv.includes('--check');
const output=(file,value)=>{
    const target=path.join(root,file);
    if(check){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==value)throw Error('Stale interface theme output: '+file);}
    else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value);}
};
const ids=new Set();
for (const entry of Object.values(spec.native)) {
    if (!spec.roles.includes(entry.role)) throw Error("Unknown native semantic role: " + entry.role);
    for (const mode of ["light", "dark"]) {
        const [hex, alpha] = entry[mode].split("/");
        if (!/^(?:[a-f0-9]{6}|[a-f0-9]{8})$/i.test(hex) ||
            (alpha !== undefined && (!Number.isFinite(Number(alpha)) || Number(alpha) < 0 || Number(alpha) > 1)))
            throw Error("Invalid native token: " + entry[mode]);
    }
}
for (const entry of Object.values(spec.web)) for (const part of entry.recipe)
    if (typeof part !== "string" && !spec.roles.includes(part.role)) throw Error("Unknown Web semantic role: " + part.role);
for(const theme of spec.themes){
    if(!/^[a-z][a-z0-9]*$/.test(theme.id)||ids.has(theme.id))throw Error('Invalid/duplicate theme ID');ids.add(theme.id);
    if(!theme.classic)for(const mode of ['light','dark'])for(const role of spec.roles)
        if(!/^#[0-9a-f]{6}$/i.test(theme[mode]?.[role]||''))throw Error('Missing semantic role: '+theme.id+'/'+mode+'/'+role);
}
if(!spec.themes[0].classic||spec.themes[0].id!=='classic')throw Error('Classic fallback must be first');
function nativeValue(value,role,theme,mode){
    const [argb,alpha]=value.split('/');
    const normalized=argb.length===6?'FF'+argb:argb;
    if(!/^[0-9a-f]{8}$/i.test(normalized))throw Error('Invalid native color '+value);
    return {hex:theme.classic?normalized:normalized.slice(0,2)+theme[mode][role].slice(1),alpha:alpha===undefined?undefined:Number(alpha)};
}
function kotlinColor(v){return 'Color(0x'+v.hex+')'+(v.alpha===undefined?'':'.copy(alpha = '+v.alpha+'f)');}
function cssColor(value,role,theme,mode){
    if(theme.classic)return value;
    let alpha=1;
    if(value.startsWith('#')){
        const raw=value.slice(1),hex=raw.length<=4?[...raw].map(c=>c+c).join(''):raw;
        if(hex.length===8)alpha=parseInt(hex.slice(6),16)/255;
    }else{
        const nums=value.match(/[\d.]+%?/g)||[];
        if(nums.length===4)alpha=nums[3].endsWith('%')?parseFloat(nums[3])/100:Number(nums[3]);
    }
    const hex=theme[mode][role];
    return alpha===1?hex:hex+Math.round(alpha*255).toString(16).padStart(2,'0');
}
const registry=Object.fromEntries(spec.themes.map(theme=>[theme.id,{id:theme.id,label:theme.label,labelKey:theme.labelKey,
    ...Object.fromEntries(['light','dark'].map(mode=>[mode,{
        native:Object.fromEntries(Object.entries(spec.native).map(([key,e])=>[key,nativeValue(e[mode],e.role,theme,mode)])),
        gradients:Object.fromEntries(Object.entries(spec.gradients).map(([key,e])=>[key,theme.classic?e[mode]:[theme[mode].background,theme[mode].backgroundEnd].map(c=>'FF'+c.slice(1))])),
        web:Object.fromEntries(Object.entries(spec.web).map(([key,e])=>['--it-'+key,e.recipe.map(part=>typeof part==='string'?part:cssColor(part.classic,part.role,theme,mode)).join('')]))
    }]))
}]));
output('src/theme/interfaceThemes.generated.ts','// src/theme/interfaceThemes.generated.ts — generated; edit interfaceThemeSpec.json.\nexport const interfaceThemes = '+JSON.stringify(registry,null,2)+' as const;\nexport type InterfaceThemeId = keyof typeof interfaceThemes;\nexport function resolveInterfaceTheme(value: unknown): InterfaceThemeId { return typeof value === "string" && Object.hasOwn(interfaceThemes,value) ? value as InterfaceThemeId : "classic"; }\n');
const colors=Object.keys(spec.native),gradients=Object.keys(spec.gradients);
let kt='package io.github.huleixin.tingyu.chrome\n\nimport androidx.compose.ui.graphics.Color\n\n// InterfaceThemes.generated.kt — generated from src/theme/interfaceThemeSpec.json.\ninternal object InterfaceThemes {\n';
kt+='    fun resolve(id: String?) = if (id in setOf('+spec.themes.map(t=>'"'+t.id+'"').join(',')+')) id!! else "classic"\n';
kt+='    fun launchTheme(id: String, mode: String): Int = when(resolve(id) + "_" + mode) {\n';
for(const theme of spec.themes)for(const mode of ["light","dark","system"])
    kt+='        "'+theme.id+'_'+mode+'" -> io.github.huleixin.tingyu.R.style.InterfaceLaunch_'+theme.id+'_'+mode[0].toUpperCase()+mode.slice(1)+'\n';
kt+='        else -> io.github.huleixin.tingyu.R.style.InterfaceLaunch_classic_Dark\n    }\n';
for(const theme of spec.themes)for(const mode of ['light','dark']){
    const data=registry[theme.id][mode],name=theme.id+'_'+mode;
    kt+='    private val '+name+' = listOf('+colors.map(key=>kotlinColor(data.native[key])).join(',')+')\n';
    kt+='    private val '+name+'Gradients = listOf('+gradients.map(key=>'listOf('+data.gradients[key].map(hex=>'Color(0x'+hex+')').join(',')+')').join(',')+')\n';
}
for(const [funName,suffix,type] of [['colors','','List<Color>'],['gradients','Gradients','List<List<Color>>']]){
    kt+='    fun '+funName+'(id: String, light: Boolean): '+type+' = when(resolve(id)) {\n';
    for(const theme of spec.themes)kt+='        '+(theme.id==='classic'?'else':'"'+theme.id+'"')+' -> if(light) '+theme.id+'_light'+suffix+' else '+theme.id+'_dark'+suffix+'\n';
    // Kotlin else must be last.
    kt=kt.replace(/(        else ->[^\n]+\n)((?:        "[^\n]+\n)+)/g,'$2$1');
    kt+='    }\n';
}
kt+='}\n';
output('android/app/src/main/java/io/github/huleixin/tingyu/chrome/InterfaceThemes.generated.kt',kt);
const provider='package io.github.huleixin.tingyu.chrome\n\nimport androidx.compose.runtime.Immutable\nimport androidx.compose.runtime.staticCompositionLocalOf\nimport androidx.compose.ui.graphics.toArgb\n\n// InterfacePalette.kt — generated facade; edit interfaceThemeSpec.json.\n@Immutable internal data class InterfacePalette(val light: Boolean = false, val style: String = "classic") {\n    private val colors = InterfaceThemes.colors(style,light)\n    private val gradients = InterfaceThemes.gradients(style,light)\n'+colors.map((key,i)=>'    val '+key+' get() = colors['+i+']\n').join('')+gradients.map((key,i)=>'    val '+key+' get() = gradients['+i+']\n').join('')+'}\ninternal val LocalInterfacePalette = staticCompositionLocalOf { InterfacePalette() }\ninternal fun ChromeSurface.interfacePaint(palette: InterfacePalette): ChromeSurface =\n    if(id == "stage" || (!palette.light && InterfaceThemes.resolve(palette.style) == "classic" && !light)) this else copy(light=palette.light, ink=if(!palette.light && InterfaceThemes.resolve(palette.style) == "classic") ink else String.format("#%06x",palette.ink.toArgb() and 0xffffff), accent=if(!palette.light && InterfaceThemes.resolve(palette.style) == "classic") accent else String.format("#%06x",palette.accent.toArgb() and 0xffffff))\n';
const paletteHistory = [
    "// android/app/src/main/java/io/github/huleixin/tingyu/chrome/InterfacePalette.kt",
    "// 深色页面背景渐变收编（UI 统一工程）：原先以字面量散落在 NativePageView 等调用点，",
    "// 现在集中到这里，与 InterfacePalette/LightInterfaceColors 对应。数值 = 1.3.182 基线原值。",
    "// The dark branch returns the original literal unchanged, including its alpha.",
    "// Classic retains the historical values above; the registry now owns the former objects.",
].join("\n");
output('android/app/src/main/java/io/github/huleixin/tingyu/chrome/InterfacePalette.kt',provider.replace("@Immutable",paletteHistory+"\n@Immutable"));
const scope=':is(.mobile-library,[data-folia-settings-overlay],[data-folia-search-workspace],[data-folia-keyboard-window],.sleep-scrim,.ty-sheet,.ml-sheet,[data-folia-status-toast],.ty-interface-setting,.ty-search)';
let css='/* src/styles/interfaceThemes.generated.css — generated from interfaceThemeSpec.json. */\n';
const block=(selector,vars)=>selector+' {\n'+Object.entries(vars).map(([k,v])=>'  '+k+': '+v+';').join('\n')+'\n}\n';
css+=block(':root',registry.classic.dark.web);
// Rebind aliases at each ordinary boundary so values resolve locally, never through stage tokens.
const source=fs.readFileSync(path.join(root,'src/styles/tingyuTokens.css'),'utf8');
const [darkPart,lightPart]=source.split(/\nhtml\[data-interface-appearance='light'\]/);
const aliases=part=>Object.fromEntries([...part.matchAll(/(--ty-[\w-]+):\s*(var\(--it-[\w-]+\));/g)].map(m=>[m[1],m[2]]));
for(const theme of spec.themes)for(const mode of ['light','dark']){
    const selector='html'+(theme.classic?':not([data-interface-theme]),html[data-interface-theme="classic"]':'[data-interface-theme="'+theme.id+'"]');
    const selectors=selector.split(',').map(s=>s+'[data-interface-appearance="'+mode+'"] '+scope).join(',');
    css+=block(selectors,{...registry[theme.id][mode].web,...aliases(darkPart),...(mode==='light'?aliases(lightPart):{})});
}
// Legacy ordinary boundaries can carry inline CSS aliases. Resolve all of them here,
// while the root and lyric renderer retain their independently owned visual tokens.
for(const theme of spec.themes.filter(t=>!t.classic))for(const mode of ['light','dark']){
    const p=theme[mode],vars={};
    const bind=(names,value)=>names.split(' ').forEach(name=>vars[name]=value+' !important');
    bind('--ui-bg --bg-color --ml-bg --ml-home-base --ty-bg',p.background);
    bind('--ui-surface --ml-surface --ty-card --ty-panel --lx-card',p.surface);
    bind('--ui-sheet --mps-glass --ty-panel-strong',p.sheet);
    bind('--ui-ink --text-primary --ml-ink --ty-text --lx-ink',p.ink);
    bind('--ui-muted --text-secondary --ml-muted --ml-home-muted --ty-muted --ty-settings-muted --lx-muted',p.muted);
    bind('--ui-accent --text-accent --accent-color --ml-jade --ty-accent --ty-settings-mint --lx-accent',p.accent);
    bind('--text-on-accent',p.onAccent);
    bind('--ui-selected --ty-accent-soft',p.accent+'20');
    bind('--ui-line --ml-line --ty-border --ty-settings-line --mps-border --lx-border',p.border+'30');
    for(const [role,value] of Object.entries(p))vars['--if-'+role]=value;
    vars['color-scheme']=mode;
    const selector='html[data-interface-theme="'+theme.id+'"][data-interface-appearance="'+mode+'"]';
    css+=block(selector+' '+scope,vars);
    // Portal menus are part of ordinary controls even when detached from the settings DOM.
    css+=block(selector+' :is([data-folia-themed-dialog],[data-folia-themed-overlay],[data-interface-menu],.ty-lx-manager)',vars);
}
// Preview pixels use the original classic bindings; their artwork palettes remain locally owned.
css+=block('[data-folia-stage-preview]',{...registry.classic.dark.web,...aliases(darkPart)});
css+=block('html[data-interface-appearance="light"] [data-folia-stage-preview]',aliases(lightPart));
output('src/styles/interfaceThemes.generated.css',css);
const launch=Object.fromEntries(spec.themes.map(t=>[t.id,Object.fromEntries(['light','dark'].map(m=>[m,'#'+registry[t.id][m].native.launch.hex.slice(2)]))]));
const startup=Object.fromEntries(spec.themes.map(t=>[t.id,Object.fromEntries(['light','dark'].map(m=>{
    const ink='#'+registry[t.id][m].native.launchInk.hex.slice(2);
    const color=role=>'#'+registry[t.id][m].native[role].hex.slice(2);
    return [m,{bg:launch[t.id][m],ink,muted:color('muted'),halo:color('accent'),wave:color('accent'),rgb:[1,3,5].map(i=>parseInt(ink.slice(i,i+2),16)).join(',')}];
}))]));
output('public/interface-theme-startup.css','/* Generated first-frame fallback. */\n:root{--ty-launch-bg:'+startup.classic.dark.bg+';--ty-launch-ink:'+startup.classic.dark.ink+';--ty-launch-rgb:'+startup.classic.dark.rgb+';--ty-launch-muted:'+startup.classic.dark.muted+';--ty-launch-halo:'+startup.classic.dark.halo+';--ty-launch-wave:'+startup.classic.dark.wave+'}\n');
output('public/interface-theme-startup.js','// Generated synchronous startup palette; no fetch, mount or player side effects.\n(function(){var palettes='+JSON.stringify(startup)+',mode="dark",style="classic";try{mode=localStorage.getItem("tingyu_interface_appearance_v1")||mode;style=localStorage.getItem("tingyu_interface_theme_v1")||style;}catch(e){}var native={};try{if(window.TingyuLaunch)native=JSON.parse(window.TingyuLaunch.config());}catch(e){}window.__tingyuLaunch=native;if(native.style)style=native.style;if(native.mode)mode=native.mode;if(!Object.prototype.hasOwnProperty.call(palettes,style))style="classic";var light=typeof native.light==="boolean"?native.light:mode==="light"||(mode==="system"&&typeof matchMedia==="function"&&matchMedia("(prefers-color-scheme: light)").matches),root=document.documentElement,p=palettes[style][light?"light":"dark"];root.dataset.launchLight=String(light);root.dataset.launchSkip=String(native.show===false);root.dataset.launchReduced=String(native.reduced===true);root.dataset.interfaceTheme=style;root.style.setProperty("--ty-launch-bg",p.bg);root.style.setProperty("--ty-launch-ink",p.ink);root.style.setProperty("--ty-launch-rgb",p.rgb);["muted","halo","wave"].forEach(function(key){root.style.setProperty("--ty-launch-"+key,p[key]);});})();\n');
// Android 12 starting-window themes are persisted by SplashScreen.setSplashScreenTheme.
for(const night of [false,true]){
    let xml='<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated interface startup resources. -->\n<resources>\n';
    for(const t of spec.themes)for(const m of ["light","dark"])
        xml+='  <color name="interface_launch_'+t.id+'_'+m+'">'+launch[t.id][m]+'</color>\n';
    for(const t of spec.themes)for(const mode of ['Light','Dark','System']){
        const light=mode==='Light'||mode==='System'&&!night,bg=launch[t.id][light?'light':'dark'];
        xml+='  <style name="InterfaceLaunch_'+t.id+'_'+mode+'" parent="AppTheme.NoActionBarLaunch">\n    <item name="android:windowBackground">'+bg+'</item>\n    <item name="windowSplashScreenBackground">'+bg+'</item>\n    <item name="android:windowSplashScreenBackground">'+bg+'</item>\n    <item name="android:windowLightStatusBar">'+light+'</item>\n    <item name="android:windowLightNavigationBar">'+light+'</item>\n  </style>\n';
    }xml+='</resources>\n';output('android/app/src/main/res/values'+(night?'-night':'')+'/interface_themes.generated.xml',xml);
}
console.log(check?'Interface themes are current':'Generated '+ids.size+' interface theme(s)');
