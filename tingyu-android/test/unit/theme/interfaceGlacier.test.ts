import fs from 'node:fs';
import vm from 'node:vm';
import {afterEach,expect,it,vi} from 'vitest';
import {interfaceThemes,resolveInterfaceTheme} from '@/theme/interfaceThemes.generated';
import {useThemeSettingsStore} from '@/stores/useThemeSettingsStore';
import {getContrastRatio} from '@/utils/themeColorMath';
import {INTERFACE_THEME_KEY} from '@/services/interfaceAppearance';

// test/unit/theme/interfaceGlacier.test.ts
// Check actual generated paint and startup code, not a second test-only palette.
afterEach(()=>vi.unstubAllGlobals());
it.each(['light','dark'] as const)('%s foreground roles meet AA on every solid ordinary surface',mode=>{
    const p=interfaceThemes.glacier[mode].native;
    const hex=(key:keyof typeof p)=>'#'+p[key].hex.slice(2);
    for(const bg of ['launch','sheet','surface','panelSurface'] as const)
        for(const ink of ['ink','muted','accent'] as const)
            expect(getContrastRatio(hex(ink),hex(bg)),ink+' on '+bg).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(hex('onAccent'),hex('button'))).toBeGreaterThanOrEqual(4.5);
});
it('style persistence does not mutate mode, lyric settings or the lyric settings snapshot',()=>{
    vi.stubGlobal('localStorage',{setItem:vi.fn()});
    useThemeSettingsStore.setState({interfaceTheme:'classic',interfaceAppearance:'system',isDaylight:true,followSystemTheme:true});
    const before=useThemeSettingsStore.getState();
    useThemeSettingsStore.getState().setInterfaceTheme('glacier');
    const after=useThemeSettingsStore.getState();
    for(const key of Object.keys(before) as (keyof typeof before)[])if(key!=='interfaceTheme')expect(after[key],key).toBe(before[key]);
    expect(localStorage.setItem).toHaveBeenCalledWith(INTERFACE_THEME_KEY,'glacier');
    useThemeSettingsStore.getState().setInterfaceTheme('broken' as 'classic');
    expect(useThemeSettingsStore.getState().interfaceTheme).toBe('classic');
});
for(const style of ['classic','glacier','unknown'])for(const mode of ['light','dark','system'])for(const system of [true,false])
it('synchronous startup '+[style,mode,system].join('/'),()=>{
    const vars:Record<string,string>={},dataset:Record<string,string>={};
    vm.runInNewContext(fs.readFileSync('public/interface-theme-startup.js','utf8'),{
        localStorage:{getItem:(key:string)=>key===INTERFACE_THEME_KEY?style:mode},
        matchMedia:()=>({matches:system}),document:{documentElement:{dataset,style:{setProperty:(key:string,value:string)=>vars[key]=value}}},
    });
    const resolved=resolveInterfaceTheme(style),light=mode==='light'||mode==='system'&&system;
    expect(dataset).toMatchObject({interfaceTheme:resolved,launchLight:String(light)});
    expect(vars['--ty-launch-bg']).toBe('#'+interfaceThemes[resolved][light?'light':'dark'].native.launch.hex.slice(2));
});
it('blocked startup storage uses the safe classic dark first frame',()=>{
    const vars:Record<string,string>={};
    vm.runInNewContext(fs.readFileSync('public/interface-theme-startup.js','utf8'),{
        localStorage:{getItem:()=>{throw Error('blocked')}},document:{documentElement:{dataset:{},style:{setProperty:(k:string,v:string)=>vars[k]=v}}},
    });
    expect(vars['--ty-launch-bg']).toBe('#102D25');
});
it('generated native and Web startup colors agree for every registered style and system resource',()=>{
    for(const [id,theme] of Object.entries(interfaceThemes))for(const night of [false,true]){
        const xml=fs.readFileSync('android/app/src/main/res/values'+(night?'-night':'')+'/interface_themes.generated.xml','utf8');
        for(const mode of ['Light','Dark','System']){
            const p=theme[mode==='Light'||mode==='System'&&!night?'light':'dark'];
            const body=xml.split('name="InterfaceLaunch_'+id+'_'+mode+'"')[1].split('</style>')[0];
            expect(body).toContain('>#'+p.native.launch.hex.slice(2)+'</item>');
            expect(body).toContain('name="windowSplashScreenBackground"');
        }
    }
});
