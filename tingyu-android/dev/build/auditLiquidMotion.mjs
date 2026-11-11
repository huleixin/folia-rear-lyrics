import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// dev/build/auditLiquidMotion.mjs
// Source coverage guard, not a claim of runtime/GPU or device validation.
const root = fileURLToPath(new URL('../..', import.meta.url));
const chrome = 'android/app/src/main/java/io/github/huleixin/tingyu/chrome/';
const minimal = 'android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/';
const read = name => readFileSync(path.join(root, name), 'utf8');
const contracts = [
    ['retained cover-origin player', chrome+'ComposeChromeHost.kt', ['miniCoverBounds','playerArtwork','rememberLiquidPlayerProgress']],
    ['real canvas transform', chrome+'LiquidMotion.kt', ['playerTransform(origin','scaleX = transform.scale','liquidReveal']],
    ['measured destination cover', minimal+'MinimalCoverPage.kt', ['anchor.artwork(it)']],
    ['gradient stop normalization', chrome+'LiquidPalette.kt', ['blendGradient(fromGradients','segments = a / gcd']],
    ['route families', chrome+'NativePageView.kt', ['NativeHomePage','NativeDirectoryPage','NativeSearchPage','SettingsFlowPage','NativeRearControlPage','MediaDetailScaffold']],
    ['retained settings modal', chrome+'SettingsFlowPage.kt', ['retainedModal','flow.modal ?: retainedModal.value','TyPanelOverlay']],
    ['search and hotlist', chrome+'NativeSearchPage.kt', ['underline=true','LiquidDropdown','if(reduced)0 else 220']],
    ['library and artist', chrome+'NativeDirectoryPage.kt', ['LiquidDropdown','animateContentSize','chromeClickable']],
    ['sort menus', chrome+'NativePageWidgets.kt', ['LiquidDropdown']],
    ['native popup exit', chrome+'LiquidPopup.kt', ['MutableTransitionState','dismissOnClickOutside = true','ExitTransition.None']],
    ['minimal menu policy', minimal+'MinimalPlayerScreen.kt', ['LocalLiquidReduced.current','LaunchedEffect(shown, reduced)']],
    ['queue mutations', minimal+'MinimalQueueSheet.kt', ['Modifier.animateItem()','dragged || reduced']],
    ['settings reorder', chrome+'SettingsRichControls.kt', ['animateBounds','key(option.value)','if (reduced) Modifier']],
    ['support choices', chrome+'SupportSheets.kt', ['LiquidChoiceRow']],
    ['account reduced motion', 'src/library/suites/mobile/account/OnlineProviderLoginModal.tsx', ['useLiquidReduced','TY_SPRING.panel']],
    ['account retained confirmation', 'src/library/suites/mobile/account/GridAccountSurface.tsx', ['switchContent','nativeStatic={false}','Boolean(pendingSwitch)']],
];
const checks = contracts.map(([area,file,tokens]) => ({area,file,pass:tokens.every(token=>read(file).includes(token))}));
const dropdownFiles = readdirSync(path.join(root,chrome)).filter(name=>name.endsWith('.kt') && /(?<!fun )\bDropdownMenu\(/.test(read(chrome+name)));
checks.push({area:'no unclassified Material dropdown entry',file:chrome,pass:dropdownFiles.length===0,files:dropdownFiles});
const deliberate = {
    'MinimalPlayerPage.kt': 'adapter: motion owned by ComposeChromeHost + MinimalPlayerScreen',
    'NativeSettingsGradient.kt': 'static gradient parser; palette animation owned by consumers',
    'NativeSettingsPaint.kt': 'static compatibility display-list painter',
    'NativeSettingsSvg.kt': 'static SVG painter',
    'SettingsColorPad.kt': 'direct finger tracking; adding spring would delay color selection',
    'SettingsDiagnostics.kt': 'diagnostic identity/logging, no visible surface',
    'SettingsLayoutModel.kt': 'declarative model/parser, no visible surface',
    'SettingsPreviewCutout.kt': 'preview clipping geometry; protected renderer owns preview motion',
    'SettingsSvgViewport.kt': 'SVG viewport math, no visible surface',
    'SettingsSwatch.kt': 'static swatch drawing helper; parent controls own feedback',
};
const surfaces = [chrome,minimal].flatMap(dir=>readdirSync(path.join(root,dir)).filter(name=>/Page|Sheet|Menu|Popup|Dialog|Settings/.test(name)&&name.endsWith('.kt')).map(name=>({file:dir+name,coverage:deliberate[name] ?? (/Liquid|liquid|animate|Animated|chromeClickable|ChromeButton|TySheet|TyPanel|TySettings|NativePage|SettingsFlow/.test(read(dir+name))?'shared or local implementation':'review required')})));
const report = {kind:'source-coverage-only',checks,surfaces,deviceVerified:false};
const output = process.argv[2];
if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');
for(const check of checks)console.log(`${check.pass?'PASS':'FAIL'} ${check.area}`);
console.log(`Reviewed ${surfaces.length} native surface modules. Device verification remains separate.`);
if(checks.some(check=>!check.pass)||surfaces.some(item=>item.coverage==='review required'))process.exitCode=1;
