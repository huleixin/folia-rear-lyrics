# Interface theme dependency and color inventory

Baseline: 550bdf9e2c28d01b972ba02c8a3d997dd5aa6a87. Captured before edits.

Store → interface appearance sync → native bridge → Compose host/provider → pages, navigation, mini player, panels and top glass. CSS semantic scopes paint WebView forms and ordinary portals. Native preference mirror and synchronous launch script own startup color.

Independent: Folia/stage/rear/island visuals, minimal cover-derived player and its sheets, lyric theme editor color values, artwork/cover gradients, QR white backing, alpha masks and optical shadow math. These must not select the ordinary interface theme.

Classical component variants intentionally retain their exact different values/alphas. The shared registry owns these variants; additional themes resolve them from semantic roles.

## Pre-migration literal locations

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeMaterial.kt
```
313: val surface = if (light) Color(0xFFF7F8F8).copy(alpha = (spec.fallbackLightAlpha * fill).coerceIn(0f, 1f))
314: else Color(0xFF0E1210).copy(alpha = (spec.fallbackDarkAlpha * fill).coerceIn(0f, 1f))
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeModel.kt
```
42: data.optString("accent","#86d8b8"), data.optString("ink","#fffdf6"),
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromePress.kt
```
39: internal fun pagePressTint(): Color = interfaceColor(Color(0x12FFFFFF), Color(0x0F1B2A22))
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/ComposeChromeHost.kt
```
327: web.setBackgroundColor(if (stage) android.graphics.Color.rgb(3,10,9) else android.graphics.Color.TRANSPARENT)
1079: if(graphics.enabled)Text("N · 记闪烁",color=Color(0xFFB8FFE3),fontSize=10.sp,
1080: modifier=Modifier.zIndex(20f).offset(12.dp,(safeTop+3).dp).background(Color(0xDD09251C))
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/InterfacePalette.kt
```
10: val Ink=Color(0xFF213E34)
11: val Muted=Color(0xFF496357)
12: val Accent=Color(0xFF246E55)
13: val Icon=Color(0xFF486153)
14: val Surface=Color(0xFFE3EBE2)
15: val Card=Color(0xCCE9F0E8)
16: val Subtle=Color(0x18315D43)
17: val Border=Color(0x38315D43)
18: val Divider=Color(0x26315D43)
19: val Selected=Color(0x20327856)
20: val Focus=Color(0x88246E55)
21: val SelectedBorder=Color(0x66327856)
22: val Button=Color(0xFF9BD9BC)
23: val SoftButton=Color(0xFFD2E6D7)
24: val Floating=Color(0xE6E3EBE2)
25: val Sheet=Color(0xFFF1F4ED)
26: val Backgrounds=listOf(Color(0xFFE3EDE2),Color(0xFFF0F3EA),Color(0xFFF4F5EE))
31: val Ink=Color(0xFFF4F7F5)
32: val Muted=Color(0xFFA2B6AC)
33: val Accent=Color(0xFF9FE0C4)
35: val SettingsBackgrounds=listOf(Color(0xFF061D16),Color(0xFF02120E),Color(0xFF041A13))
36: val SearchBackgrounds=listOf(Color(0xFF05170F),Color(0xFF03110C))
37: val HomeBackgrounds=listOf(Color(0xFF102D25),Color(0xFF010E0D),Color(0xFF010D0C))
42: val ink get()=color(Color(0xFFF4F7F5),LightInterfaceColors.Ink)
43: val muted get()=color(Color(0xFFA2B6AC),LightInterfaceColors.Muted)
44: val accent get()=color(Color(0xFF9FE0C4),LightInterfaceColors.Accent)
50: if(id=="stage"||!light&&!this.light)this else copy(light=light,ink=if(light)"#213e34"else ink,accent=if(light)"#246e55"else accent)
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/LaunchSurface.kt
```
7: // 颜色取自 NativePageView 的首页渐变（深色 #102D25 → #010D0C，浅色 #E3EDE2 → #F4F5EE）。
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/MediaDetail.kt
```
38: private val PlaylistJade:Color @Composable get()=interfaceColor(Color(0xFF7EE0C2),LightInterfaceColors.Accent)
124: Box(Modifier.size(art).shadow(8.dp,RoundedCornerShape(12.dp)).clip(RoundedCornerShape(12.dp)).background(interfaceColor(Color(0xFF14211E),LightInterfaceColors.Surface))){
158: Row(Modifier.weight(1f).height(42.dp).clip(RoundedCornerShape(24.dp)).background(interfaceColor(Color(0xFF7EE0C2),LightInterfaceColors.Button))
161: ChromeGlyph("play",Color(0xFF04231B),Modifier.size(20.dp));Text(item.title,color=Color(0xFF04231B),fontSize=15.sp,fontWeight=FontWeight(650))
165: Box(Modifier.size(44.dp,42.dp).clip(RoundedCornerShape(99.dp)).background(interfaceColor(Color(0x0AB7E6D3),LightInterfaceColors.Subtle)).clickable(enabled=!item.disabled){action(item.action,"",0.0)},contentAlignment=Alignment.Center){
176: Column(Modifier.fillMaxWidth().background(if(item.selected)interfaceColor(Color(0x247EE0C2),LightInterfaceColors.Selected)else Color.Transparent)
190: Box(Modifier.fillMaxWidth().padding(start=86.dp,end=18.dp).height(1.dp).background(interfaceColor(Color(0x09C7E4D5),LightInterfaceColors.Divider)))
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/MiniSleepMenu.kt
```
48: val tint=if(light)Color(0x33F1F4ED)else Color(0x4D303B36)
49: val arrowTint=if(light)Color(0xB8F1F4ED)else Color(0xA1303B36)
157: if(ui.error.isNotBlank())Text(ui.error,color=if(light)Color(0xFFA13F35)else Color(0xFFFFB6A6),fontSize=12.sp,lineHeight=18.sp,modifier=Modifier.semantics{contentDescription="定时设置失败：${ui.error}"})
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeDirectoryPage.kt
```
221: val fade=interfaceColor(Color(0xE6102D25),Color(0xFFF4F5EE))
229: .clip(shape).background(if(item.selected)interfaceColor(Color(0x2C6BC8A7),LightInterfaceColors.Selected)else if(search)interfaceColor(Color(0x08FFFFFF),LightInterfaceColors.Subtle)else Color.Transparent)
230: .then(if(search)Modifier.border(1.dp,if(item.selected)interfaceColor(Color(0x709FE0C4),LightInterfaceColors.SelectedBorder)else Color.Transparent,shape)else Modifier)
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeHomePage.kt
```
90: .background(interfaceColor(Color(0x3A17352A),Color(0x59D7EADC)))
91: .border(1.dp,interfaceColor(Color(0x14FFFFFF),Color(0x2E93BBA0)),RoundedCornerShape(12.dp))
96: .background(interfaceColor(Color(0x3D9FE0C4),LightInterfaceColors.Selected)),
115: val deep=if(index==0)Color(0xFF16303C) else Color(0xFF231B33)
116: val deepEnd=if(index==0)Color(0xFF0F212B) else Color(0xFF15101F)
117: val sheen=if(index==0)Color(0x2E5FA8C0) else Color(0x2E8F72C9)
125: drawRect(Brush.radialGradient(colors=listOf(sheen,Color(0x00000000)),
127: drawRect(Brush.linearGradient(colors=listOf(Color(0x0FFFFFFF),Color(0x00000000)),
132: Text(item.title,color=Color(0xF2FFFFFF),fontSize=14.sp,lineHeight=19.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
133: Text(item.subtitle,color=Color(0xB8FFFFFF),fontSize=11.sp,lineHeight=15.sp,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=3.dp))
136: .clip(RoundedCornerShape(999.dp)).background(Color(0x2EFFFFFF)).border(1.dp,Color(0x24FFFFFF),RoundedCornerShape(999.dp))
189: Box(Modifier.width(width).height(height).clip(RoundedCornerShape(15.dp)).background(Color(0xFF172320))) {
192: Brush.verticalGradient(0f to Color(0x00000000),0.55f to Color(0x00000000),1f to Color(0x29000000))))
196: if(eyebrow.isNotBlank())Box(Modifier.offset(18.dp,(50+title.value*2.28f+10).dp).size(16.dp,2.dp).background(Color(0x99FFFFFF),RoundedCornerShape(2.dp)))
197: Text(item.subtitle,color=Color(0xD9FFFDF2),fontSize=12.sp,lineHeight=18.sp,maxLines=2,modifier=Modifier.align(Alignment.BottomStart).padding(start=18.dp,bottom=52.dp))
199: .clip(RoundedCornerShape(24.dp)).background(Color(0x30FFFFFF)).border(1.dp,Color(0x45FFFFFF),RoundedCornerShape(24.dp))
209: .background(if(state.firstVisibleItemIndex==index)interfaceColor(Color(0xFFF1F5F2),LightInterfaceColors.Muted)else interfaceColor(Color(0x38FFFFFF),LightInterfaceColors.SelectedBorder)).clickable{scope.launch{state.animateScrollToItem(index)}}) }
213: Row(modifier.heightIn(min=58.dp).clip(RoundedCornerShape(8.dp)).background(interfaceColor(Color(0xDB14241F),LightInterfaceColors.Card)).border(1.dp,interfaceColor(Color(0x10FFFFFF),LightInterfaceColors.Border),RoundedCornerShape(8.dp)),verticalAlignment=Alignment.CenterVertically){
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageFallbackPanel.kt
```
44: if (light) Brush.verticalGradient(listOf(Color(0xFFF4F8F5), Color(0xFFE9F0EB)))
45: else Brush.verticalGradient(listOf(Color(0xFF0C1A16), Color(0xFF050F0C)))
47: val ink = if (light) Color(0xFF11201B) else Color(0xFFF2F8F4)
48: val muted = if (light) Color(0xFF5B6F66) else Color(0xFF9FB3AA)
49: val accent = if (light) Color(0xFF2F7A63) else Color(0xFF6DBDAD)
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageIcon.kt
```
44: paint.color=color.toArgb();paint.style=if(filled)Paint.Style.FILL_AND_STROKE else Paint.Style.STROKE;val native=canvas.nativeCanvas;native.save();native.scale(size.width/24f,size.height/24f)
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageInput.kt
```
55: .then(if(bare)Modifier else Modifier.background(interfaceColor(Color(0x08FFFFFF),LightInterfaceColors.Subtle),shape)
56: .border(1.dp,if(focused)interfaceColor(Color(0x7791DBBD),LightInterfaceColors.Focus)else interfaceColor(Color(0x14C6E6D6),LightInterfaceColors.Border),shape))
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageWidgets.kt
```
76: Box(modifier.clip(RoundedCornerShape(radius)).background(interfaceColor(Color(0xFF14211E),LightInterfaceColors.Surface)), contentAlignment = Alignment.Center) {
85: .background(if (selected) interfaceColor(Color(0x2E9FE0C4),LightInterfaceColors.Selected) else interfaceColor(Color(0x08FFFFFF),LightInterfaceColors.Subtle))
86: .then(if(border) Modifier.border(1.dp, if(selected) interfaceColor(Color(0x709FE0C4),LightInterfaceColors.SelectedBorder) else interfaceColor(Color(0x18FFFFFF),LightInterfaceColors.Border), shape) else Modifier)
100: if(page.subtitle.isNotBlank())Text(page.subtitle,color=topGlassForegroundColor(interfaceColor(Color(0xFFB5C3BD),LightInterfaceColors.Muted),TyTopGlass.LightMuted),fontSize=14.sp,lineHeight=19.sp,modifier=Modifier.padding(top=5.dp))
118: Text(section.items.firstOrNull{it.selected}?.title?:"",color=interfaceColor(Color(0xFFB4C9BF),LightInterfaceColors.Muted),fontSize=12.sp)
139: if(item.selected&&item.image.isNotBlank())Box(Modifier.fillMaxSize().background(Color(0x52000000)),contentAlignment=Alignment.Center){NowPlayingBadge(playing)}
150: if(divider)Box(Modifier.fillMaxWidth().height(1.dp).background(interfaceColor(Color(0x0EFFFFFF),LightInterfaceColors.Divider)))
160: Box(Modifier.size(3.dp,(5f+6f*value).dp).clip(RoundedCornerShape(1.5.dp)).background(Color(0xFF9FE0C4)))
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeRearControlPage.kt
```
49: if(index>0)Box(Modifier.fillMaxWidth().padding(horizontal=14.dp).height(1.dp).background(interfaceColor(Color(0x1FA5CDB9),LightInterfaceColors.Divider)))
72: @Composable private fun Modifier.rearCard()=clip(RoundedCornerShape(14.dp)).background(interfaceColor(Color(0x3323493B),LightInterfaceColors.Card))
73: .border(1.dp,interfaceColor(Color(0x1FA5CDB9),LightInterfaceColors.Border),RoundedCornerShape(14.dp))
78: .background(if(item.selected)interfaceColor(Color(0x1A74D9BA),LightInterfaceColors.Selected)else Color.Transparent)
79: .border(1.dp,if(item.selected)interfaceColor(Color(0x4074D9BA),LightInterfaceColors.SelectedBorder)else Color.Transparent,RoundedCornerShape(10.dp))
82: Text(item.title,color=if(item.selected)interfaceColor(Color(0xFF74D9BA),LightInterfaceColors.Ink)else PageInk,fontSize=13.sp,lineHeight=19.sp,fontWeight=if(item.selected)FontWeight.SemiBold else FontWeight.Normal,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
97: modifier=Modifier.semantics{contentDescription=item.title},colors=SwitchDefaults.colors(checkedTrackColor=interfaceColor(Color(0xFF74D9BA),LightInterfaceColors.Accent),checkedThumbColor=interfaceColor(Color(0xFF103327),LightInterfaceColors.Sheet),uncheckedTrackColor=interfaceColor(Color(0xFF40584D),LightInterfaceColors.Surface),uncheckedThumbColor=PageMuted,uncheckedBorderColor=PageMuted))
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSearchOverlay.kt
```
161: .background(interfaceColor(Color(0x1AFFFFFF), LightInterfaceColors.Subtle), RoundedCornerShape(999.dp))
162: .border(1.dp, interfaceColor(Color(0x3391DBBD), LightInterfaceColors.Focus), RoundedCornerShape(999.dp))) {
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSearchPage.kt
```
87: Row(Modifier.height(38.dp).clip(RoundedCornerShape(999.dp)).background(interfaceColor(Color(0x08FFFFFF),LightInterfaceColors.Subtle)).border(1.dp,interfaceColor(Color(0x12FFFFFF),LightInterfaceColors.Border),RoundedCornerShape(999.dp)),verticalAlignment=Alignment.CenterVertically){
93: Spacer(Modifier.height(20.dp));Box(Modifier.fillMaxWidth().height(1.dp).background(interfaceColor(Color(0x12FFFFFF),LightInterfaceColors.Border)));Spacer(Modifier.height(12.dp))
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsControl.kt
```
55: if(control.value=="1")PageIcon("check",Color(0xFF04231B),Modifier.fillMaxSize().padding(2.dp))
110: val panel=if(light)Color(0xFFF6FAF7)else Color(0xFF16221E)
111: val edge=if(light)Color(0x1F0C2A20)else Color(0x33FFFFFF)
112: val label=if(light)Color(0xFF122019)else Color(0xFFE9F2EC)
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsPage.kt
```
45: PageIcon(GroupIcons[section.id]?:"settings2",interfaceColor(Color(0xFFACBFB6),LightInterfaceColors.Muted),Modifier.size(16.dp))
46: Text(section.title,color=interfaceColor(Color(0xFFACBFB6),LightInterfaceColors.Muted),fontSize=NativePageDesign.SettingsGroupTitle.sp,lineHeight=20.sp)
51: if(index>0)Box(Modifier.fillMaxWidth().padding(start=62.dp,end=14.dp).height(1.dp).background(interfaceColor(Color(0x0CA5CDB9),LightInterfaceColors.Divider)))
64: Text(page.title,color=topGlassForegroundColor(interfaceColor(Color(0xFFE8F4ED),LightInterfaceColors.Ink),TyTopGlass.LightInk),fontSize=32.sp,lineHeight=40.sp,fontWeight=FontWeight.Bold,letterSpacing=(-1.28).sp,modifier=Modifier.weight(1f))
71: Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(interfaceColor(Color(0x3323493B),LightInterfaceColors.Card))
72: .border(1.dp,interfaceColor(Color(0x1FA5CDB9),LightInterfaceColors.Border),RoundedCornerShape(14.dp)),content=content)
77: Box(Modifier.size(34.dp).clip(RoundedCornerShape(999.dp)).background(interfaceColor(Color(0x0CA6D7BF),LightInterfaceColors.Subtle)),contentAlignment=Alignment.Center){PageIcon(SettingIcons[item.id]?:"settings2",interfaceColor(Color(0xFFD2E3DA),LightInterfaceColors.Icon),Modifier.size(21.dp))}
79: Text(item.title,color=interfaceColor(Color(0xFFE8F4ED),LightInterfaceColors.Ink),fontSize=NativePageDesign.SettingsRowTitle.sp,lineHeight=19.sp,fontWeight=FontWeight.Medium)
80: if(item.subtitle.isNotBlank())Text(item.subtitle,color=if(item.selected)interfaceColor(Color(0xFF74D9BA),LightInterfaceColors.Accent)else interfaceColor(Color(0xFF9EB3AA),LightInterfaceColors.Muted),fontSize=11.sp,lineHeight=16.5.sp,modifier=Modifier.padding(top=2.dp))
82: if(item.secondary.isNotBlank())Text(item.secondaryLabel,color=interfaceColor(Color(0xFF74D9BA),LightInterfaceColors.Accent),fontSize=11.sp,modifier=Modifier.chromeClickable(corner=8.dp){action(item.secondary,"",0.0)}.padding(vertical=10.dp))
83: else if(item.action.isNotBlank())PageIcon("chevron-right",interfaceColor(Color(0xFFC7D7CE),LightInterfaceColors.Muted),Modifier.size(18.dp))
90: Box(Modifier.size(34.dp).clip(RoundedCornerShape(999.dp)).background(interfaceColor(Color(0x0CA6D7BF),LightInterfaceColors.Subtle)),contentAlignment=Alignment.Center){PageIcon("captions",interfaceColor(Color(0xFFD2E3DA),LightInterfaceColors.Icon),Modifier.size(21.dp))}
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsPaint.kt
```
15: android.graphics.Color.argb(((values.getOrNull(3)?:1f)*255).toInt().coerceIn(0,255),values[0].toInt(),values[1].toInt(),values[2].toInt())
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/PlaylistAffordances.kt
```
26: internal val PlaylistAccent = Color(0xFF7EE0C2)
34: .shadow(3.dp,CircleShape).background(interfaceColor(Color(0xF0183029),LightInterfaceColors.Floating),CircleShape)
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/PlaylistAmbientGradient.kt
```
6: internal val PlaylistBackgroundColors = listOf(Color(0xFF03221A),Color(0xFF03130E),Color(0xFF031812))
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsFlowPage.kt
```
59: surface = interfaceColor(Color(0xFF061D16), LightInterfaceColors.Sheet),
60: card = interfaceColor(Color(0x3323493B), LightInterfaceColors.Card),
61: text = interfaceColor(Color(0xFFE8F4ED), LightInterfaceColors.Ink),
62: muted = interfaceColor(Color(0xFF9EB3AA), LightInterfaceColors.Muted),
63: accent = interfaceColor(Color(0xFF74D9BA), LightInterfaceColors.Accent),
64: line = interfaceColor(Color(0x1FA5CDB9), LightInterfaceColors.Border),
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsLayoutArt.kt
```
16: val color=String.format("#%06x",theme.text.toArgb() and 0xffffff)
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/TopGlassBar.kt
```
76: val LightInk = Color(0xFF122E24)
77: val LightMuted = Color(0xFF173629)
78: val LightAccent = Color(0xFF0A3020)
```

### android/app/src/main/java/io/github/huleixin/tingyu/chrome/TyPanelStyle.kt
```
52: surface = Color(0xFFF7FAF8),
53: card = Color(0xFFFFFFFF).copy(alpha = 0.62f),
54: text = Color(0xFF10231D),
55: muted = Color(0xFF5C7268),
56: accent = Color(0xFF0F6B4F),
57: line = Color(0xFF10231D).copy(alpha = 0.10f),
59: danger = Color(0xFFB3261E),
61: surface = Color(0xFF0E1A17),
62: card = Color(0xFFFFFFFF).copy(alpha = 0.055f),
63: text = Color(0xFFECF3EF),
64: muted = Color(0xFF8FA69C),
65: accent = Color(0xFF7FE3C0),
66: line = Color(0xFFFFFFFF).copy(alpha = 0.09f),
68: danger = Color(0xFFFF8A80),
```

### src/styles/interfaceAppearance.css
```
11: --bg-color:var(--ui-bg,#f4f5ee)!important;--text-primary:var(--ui-ink,#213e34)!important;--text-secondary:var(--ui-muted,#496357)!important;
12: --text-accent:var(--ui-accent,#246e55)!important;--text-on-accent:#fff!important;--accent-color:#246e55!important;
13: --ml-bg:#f4f5ee;--ml-ink:#213e34;--ml-muted:#496357;--ml-jade:#246e55;--ml-line:#315d4326;--ml-surface:#e5ede4;--ml-home-base:#f4f5ee;--ml-home-muted:#496357;
14: --ty-bg:#f1f4ed;--ty-card:#ffffff80;--ty-border:#315d4326;--ty-text:#213e34;--ty-muted:#496357;--ty-accent:#246e55;
15: --ty-settings-line:#315d4326;--ty-settings-muted:#496357;--ty-settings-mint:#246e55;
16: --mps-glass:#f1f4ed;--mps-border:#315d4326;color:#213e34;color-scheme:light;
21: --bg-color:#f4f5ee!important;--text-primary:#213e34!important;--text-secondary:#496357!important;
22: --text-accent:#246e55!important;--text-on-accent:#fff!important;--accent-color:#246e55!important;
23: --ty-bg:#f1f4ed!important;--ty-card:#ffffffb8!important;--ty-border:#315d4338!important;
24: --ty-text:#213e34!important;--ty-muted:#496357!important;--ty-accent:#246e55!important;
25: --ty-settings-line:#315d4338!important;--ty-settings-muted:#496357!important;--ty-settings-mint:#246e55!important;
26: color:#213e34!important;color-scheme:light;
31: html[data-interface-appearance='light'] [data-folia-settings-overlay] :is(.ty-settings-group-title,.ty-settings-description,.ty-settings-row-copy small) {color:var(--ui-muted,#496357)!important;opacity:1!important}
32: html[data-interface-appearance='light'] [data-folia-settings-overlay] [data-folia-settings-content] :not([data-folia-stage-preview] *) :is(p,small,label,span,div,h1,h2,h3,h4,h5,h6,button,a)[style*="--text-secondary"] {color:var(--ui-muted,#496357)!important;opacity:1!important}
36: html[data-interface-appearance='light'] [data-folia-settings-overlay] [data-folia-settings-content] :not([data-folia-stage-preview] *) :is(p,small,label)[class~="text-gray-500"] {color:var(--ui-muted,#496357)!important;opacity:1!important}
39: html[data-interface-appearance='light'] [data-folia-settings-overlay] [data-folia-settings-content] :not([data-folia-stage-preview] *) :not(button *) :not(a *) :is(p,small,label,h1,h2,h3)[class~="text-zinc-200"] {color:var(--ui-ink,#213e34)!important}
40: html[data-interface-appearance='light'] [data-folia-settings-overlay] [data-folia-settings-tabs] button[class~="opacity-40"] {color:var(--ui-muted,#496357)!important;opacity:1!important}
43: html[data-interface-appearance='light']:not([data-native-first='true']) [data-folia-app-shell][data-folia-android='true']:not([data-folia-player-view]){background:#f4f5ee!important}
46: html[data-interface-appearance='light'] [data-mobile-settings='true'] > [data-folia-settings-panel]{background:linear-gradient(180deg,#e3ede2,#f0f3ea 50%,#f4f5ee)}
47: html[data-interface-appearance='light'] [data-folia-settings-overlay][data-mobile-settings='true']{background:#f4f5ee}
50: html[data-interface-appearance='light'] .ty-setting-symbol{color:#486153!important}
52: html[data-interface-appearance='light'] .ml-home-playlist{background:linear-gradient(125deg,#ffffff70,#dce8dd70);border-color:#315d4326}
60: html[data-interface-appearance='light'] .ml-section-more{color:#496357!important}
61: html[data-interface-appearance='light'] .ty-settings-switch:not([aria-checked='true']){background:#82958b}
62: html[data-interface-appearance='light'] .ty-settings-switch[aria-checked='true']{background:#327856}
63: html[data-interface-appearance='light'] .ty-rear-toggle{background:linear-gradient(120deg,#d2e6d7,#cce2d3);color:#246e55;border-color:#315d4326}
66: html[data-interface-appearance='light'] .ml-history-chip{background:#315d4308;border-color:#315d4326;color:#213e34}
68: html[data-interface-appearance='light'] .ml-home[data-page='library'] .ml-tabs button[aria-pressed='true']{background:#3278561c;color:#246e55}
69: html[data-interface-appearance='light'] .ml-directory-sort option{color:#213e34;background:#f1f4ed}
70: html[data-interface-appearance='light'] .ml-play-all{background:#9bd9bc;color:#04231b}
72: html[data-interface-appearance='light'] .ml-footer nav button{color:#213e34!important}
73: html[data-interface-appearance='light'] .ml-footer nav button[aria-current='page']{color:#246e55!important;background:#32785615!important;border-color:#315d4326!important}
76: html[data-interface-appearance='light'] .mobile-library.ml-footer > [data-soft-glass]{background:linear-gradient(155deg,#ffffff70,transparent 55%,#ffffff20),#f1f4ed88;border-color:#315d4326;box-shadow:0 5px 16px #315d4314,inset 0 1px 0 #ffffff80}
77: html[data-interface-appearance='light'] .ml-mini-progress-track{stroke:#315d4326}
80: html[data-interface-appearance='light'] .ty-sheet{background:#f1f4ed;border-color:#315d4326;color:#213e34}
81: html[data-interface-appearance='light'] .sleep-start{background:#246e55;color:#fff}
82: html[data-interface-appearance='light'] [data-folia-status-toast]{background:#f1f4ede8;color:#213e34;border-color:#315d4326}
83: html[data-interface-appearance='light'] [data-folia-search-workspace]{background:linear-gradient(180deg,#e3ede2,#f4f5ee)!important;color:#213e34}
86: html[data-interface-appearance='light'] .ml-sheet-scrim{background:#20382b55}
88: html[data-interface-appearance='light'] .ty-search {--ty-bg:#f4f5ee;--ty-panel:#315d4308;--ty-panel-strong:#315d4310;--ty-border:#315d4326;--ty-text:#213e34;--ty-muted:#496357;--ty-accent:#246e55;--ty-accent-soft:#3278561c;}
89: html[data-interface-appearance='light'] [data-mobile-settings='true']{color:#213e34;}
90: html[data-interface-appearance='light'] .ml-mini-controls .ml-mini-toggle{color:#213e34;}
91: html[data-interface-appearance='light'] .ml-home[data-page='home']{--ml-home-muted:#496357;}
95: --bg-color:#09090b;--text-primary:#f4f4f5;--text-secondary:#71717a;--text-accent:#f4f4f5;--text-on-accent:#18181b;
99: html[data-interface-appearance='light'] .mobile-library .ml-home-playlist-card{background:linear-gradient(125deg,#ffffff70,#dce8dd70);border-color:#315d4326;}
102: html[data-interface-appearance='light'] .mobile-library .ml-home-more{color:#496357;border-color:#315d4326;}
103: html[data-interface-appearance='light'] .ml-feature-dots span{background:#315d4330;}
104: html[data-interface-appearance='light'] .ml-feature-dots span[data-active='true']{background:#496357;}
105: html[data-interface-appearance='light'] .ml-playlist-detail .ml-playlist-action{color:#213e34;background:#315d4310;}
106: html[data-interface-appearance='light'] .ml-playlist-detail .ml-playlist-play{background:#9bd9bc;}
107: html[data-interface-appearance='light'] .resource-progress progress{accent-color:#246e55;}
109: html[data-interface-appearance='light'] .ty-search{--ty-bg:#f4f5ee!important;--ty-text:#213e34!important;--ty-muted:#496357!important;--ty-accent:#246e55!important;--ty-accent-soft:#3278561c!important;}
113: html[data-interface-appearance='light'] [data-folia-themed-dialog]{background:rgba(241,244,237,.97)!important;border-color:#315d4345!important;color:#213e34;backdrop-filter:blur(20px) saturate(1.08);-webkit-backdrop-filter:blur(20px) saturate(1.08);}
114: html[data-interface-appearance='light'] [data-folia-themed-overlay]{background:rgba(14,35,25,.10)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}
115: html[data-interface-appearance='light'] .ty-lx-manager{--lx-ink:#213e34;--lx-muted:#496357;--lx-accent:#246e55;--lx-card:#ffffff80;--lx-border:#315d4326;}
```

### src/styles/mobileGlass.css
```
38: background: linear-gradient(155deg, #ffffff20, #ffffff0b 72%);
39: border: 1px solid #ffffff18;
40: box-shadow: inset 0 1px 0 #ffffff20;
58: color: #ace6cb;
76: box-shadow: inset 0 1px 0 #ffffff22, var(--ty-glass-shadow);
118: .ml-mini-progress-track { stroke: #ffffff35; }
```

### src/styles/tingyuTokens.css
```
13: --ty-color-bg: #030a09;                  /* 页面主背景（ Midnight 基底） */
14: --ty-color-bg-raised: #0d1a17;           /* 次级背景 / 抬升面 */
15: --ty-color-card: #ffffff0c;              /* 深色卡片表面 */
16: --ty-color-accent: #9fe0c4;              /* 品牌强调（InterfacePalette.dark.accent） */
17: --ty-color-accent-strong: #ace6cb;       /* 选中态强调（底栏当前页文字） */
18: --ty-color-on-accent: #04231b;           /* 强调色之上的文字 */
19: --ty-color-text: #f4f7f5;                /* 一级文字 */
20: --ty-color-text-secondary: #a2b6ac;      /* 二级文字 */
21: --ty-color-text-disabled: #5c6f66;       /* 禁用文字 */
22: --ty-color-icon: #a2b6ac;                /* 图标默认 */
23: --ty-color-border: #ffffff20;            /* 常规描边 */
24: --ty-color-selected: #ffffff20;          /* 选中/激活底色 */
25: --ty-color-danger: #ff6b6b;
26: --ty-color-success: #74d9ba;
27: --ty-color-warning: #e8c468;
33: --ty-glass-tint: rgb(11 20 19 / 46%);        /* 底栏/迷你条材质底色 */
34: --ty-glass-tint-nav: rgb(11 20 19 / 58%);    /* 导航栏比迷你条深一档 */
35: --ty-glass-tint-strong: rgb(12 23 21 / 62%); /* 播放器 soft-glass 底色 */
36: --ty-glass-tint-fallback: rgb(16 24 23 / 38%); /* 非 Blink 引擎降级 */
37: --ty-glass-border: #ffffff20;
38: --ty-glass-border-strong: #ffffff26;
39: --ty-glass-highlight: linear-gradient(155deg, #ffffff0c 0%, transparent 55%, #ffffff04 100%);
40: --ty-glass-highlight-strong: linear-gradient(150deg, #ffffff12, #ffffff02 55%);
41: --ty-glass-shadow: 0 5px 16px #0003;
50: --ty-glass-top-text: #f4f7f5;
51: --ty-glass-top-text-secondary: #a2b6ac;
52: --ty-glass-top-accent: #9fe0c4;
93: --ty-glass-top-text: #122e24;
94: --ty-glass-top-text-secondary: #173629;
95: --ty-glass-top-accent: #0a3020;
96: --ty-color-bg: #f4f5ee;
97: --ty-color-bg-raised: #e3ebe2;   /* 对齐 LightInterfaceColors.Surface（原 #e5ede4 为双端漂移值） */
98: --ty-color-card: #ffffff80;
99: --ty-color-accent: #246e55;
100: --ty-color-accent-strong: #246e55;
101: --ty-color-on-accent: #ffffff;
102: --ty-color-text: #213e34;
103: --ty-color-text-secondary: #496357;
104: --ty-color-text-disabled: #82958b;
105: --ty-color-icon: #486153;
106: --ty-color-border: #315d4326;
107: --ty-color-selected: #3278561c;
108: --ty-glass-tint: #f1f4ed88;
109: --ty-glass-tint-nav: #f1f4ed88;
110: --ty-glass-tint-strong: #f1f4ed88;
111: --ty-glass-tint-fallback: #f1f4ed88;
112: --ty-glass-border: #315d4326;
113: --ty-glass-highlight: linear-gradient(155deg, #ffffff70 0%, transparent 55%, #ffffff20 100%);
114: --ty-glass-highlight-strong: linear-gradient(150deg, #ffffff70, #ffffff20 55%);
115: --ty-glass-shadow: 0 5px 16px #315d4314;
```

### src/library/suites/mobile/mobileLibrary.css
```
4: --ml-bg: #030a09;
5: --ml-ink: #f4f7f5;
6: --ml-muted: #a2b6ac;   /* 对齐 InterfacePalette dark.muted */
7: --ml-jade: #7ee0c2;
8: --ml-line: #ffffff10;
9: --ml-surface: #14211e;
51: background: #c4d2cc80;
196: background: linear-gradient(180deg, #062a23 0, #030f0c 160px, var(--ml-bg) 350px);
199: --ml-home-base: #010e0d;
200: --ml-home-muted: #a8b8b2;
213: radial-gradient(ellipse 75% 30% at 52% 0%, #184b4080, transparent 100%),
214: radial-gradient(ellipse 70% 13% at 5% 100%, #1c51415c, transparent 100%),
215: linear-gradient(180deg, #081f1a 0, var(--ml-home-base) 45%, #010d0c 100%);
248: background-color: #0008;
275: background: #ffffff0d;
278: background: #ffffff05;
326: color: #b5c3bd;
346: border: 1px solid #ffffff20;
348: background: #ffffff08;
398: border: 1px solid #ffffff18;
400: color: #d1ddd7;
401: background: #ffffff08;
447: background: linear-gradient(transparent, #000a);
471: color: #ffffffb3;
480: color: #031b14;
534: border-bottom: 1px solid #ffffff0e;
582: border: 1px solid #ffffff10;
584: background: linear-gradient(125deg, #14241fdb, #101b18d9);
618: color: #bac8c1;
684: background: #7ee0c21a;
770: border: 1px solid #ffffff30;
772: background: #17221eeb;
775: box-shadow: 0 4px 18px #0007;
825: border: 1px solid #ffffff30;
827: background: #1d2926eb;
830: box-shadow: 0 6px 22px #0008;
839: color: #ffffffe6;
849: background: #ffffff20;
853: fill: #ffffff26;
944: border: 1px solid #ffffff30;
945: background: #1d2926f0;
947: box-shadow: 0 4px 18px #0007;
955: 0%, 30% { background: #7ee0c229; }
1061: background: #0008;
1073: box-shadow: 0 -8px 40px #10231d18;
1129: color: #031b14;
1134: color: #ff939a;
1252: .ml-quality-text[data-level="hq"]       { color: color-mix(in srgb, #7FA3C4 52%, var(--ml-muted)); }
1253: .ml-quality-text[data-level="flac"]     { color: color-mix(in srgb, #C9A96E 58%, var(--ml-muted)); }
1254: .ml-quality-text[data-level="hires"]    { color: color-mix(in srgb, #A5A2E8 52%, var(--ml-muted)); }
1255: .ml-quality-text[data-level="master"]   { color: color-mix(in srgb, #D2A8A8 52%, var(--ml-muted)); }
1256: .ml-quality-text[data-level="spatial"]  { color: color-mix(in srgb, #86BDBB 55%, var(--ml-muted)); }
```

### src/library/suites/mobile/mobileLibraryPage.css
```
5: --ml-bg: #031812;
10: background-image: radial-gradient(ellipse at 8% -10%, #124c3a66, transparent 52%), linear-gradient(155deg, #03221a, #03130e 42%, var(--ml-bg) 72%);
22: .ml-home[data-page='library'] .ml-tabs button[aria-pressed='true'] { background: #6bc8a72c; color: #9ae8cb; }
26: .ml-home[data-page='library'] .ml-filter { height: 40px; min-height: 40px; margin: 0 0 14px; padding: 0 12px; gap: 10px; border: 1px solid #c6e6d614; border-radius: 14px; background: #d0f4df08; }
28: .ml-home[data-page='library'] .ml-filter:focus-within { border-color: #91dbbd77; box-shadow: 0 0 0 1px #91dbbd25; }
31: .ml-home[data-page='library'] .ml-directory-sort { display: flex; align-items: center; position: relative; color: #b4c9bf; min-width: 0; }
33: .ml-home[data-page='library'] .ml-directory-sort option { color: #ecf5f0; background: #0c2219; }
39: .ml-home[data-page='library'] .ml-card-row small { font-size: 12px; line-height: 1.5; margin-top: 3px; color: #a2b6ac; }
40: .ml-home[data-page='library'] .ml-card-row > svg { width: 16px; height: 16px; color: #a4bbae; flex: none; }
41: .ml-home[data-page='library'] .ml-card-row:active { background: #abd9be0a; }
```

### src/library/suites/mobile/mobilePlaylistDetail.css
```
3: --ml-bg: #031812;
4: --ml-muted: #a2b6ac;   /* 对齐 InterfacePalette dark.muted，避免双端三个近似色 */
5: --ml-jade: #7ee0c2;
10: background-image: linear-gradient(180deg, #03221a, #03130e 50%, var(--ml-bg) 100%);
19: mask-image: linear-gradient(#000 28%, transparent 100%);
20: -webkit-mask-image: linear-gradient(#000 28%, transparent 100%);
26: mask-image: radial-gradient(ellipse at 80% 12%, #000, transparent 85%);
27: -webkit-mask-image: radial-gradient(ellipse at 80% 12%, #000, transparent 85%);
44: .ml-playlist-detail .ml-playlist-cover { width: 100%; border-radius: 12px; box-shadow: 0 8px 24px #0003; }
60: .ml-playlist-detail .ml-playlist-play { display: flex; align-items: center; justify-content: center; gap: 8px; flex: 1; min-width: 0; min-height: 42px; border-radius: 24px; background: #7ee0c2; color: #04231b; font-size: 15px; font-weight: 650; transition: transform 130ms ease, background-color 130ms ease; }
62: .ml-playlist-detail .ml-playlist-action { display: grid; place-items: center; width: 44px; height: 42px; border-radius: 50%; background: #b7e6d30a; color: #f4f7f5; transition: transform 130ms ease; }
71: .ml-playlist-detail .ml-song-row::after { content: ''; position: absolute; bottom: 0; left: 86px; right: 18px; height: 1px; background: #c7e4d509; pointer-events: none; }
72: .ml-playlist-detail .ml-song-row[data-first='true'] { border-radius: 26px 26px 0 0; border-top: 1px solid #c7e4d50c; }
79: .ml-playlist-detail .ml-song-row.is-current { background: #7ee0c224; }
90: .ml-playlist-detail .ml-error button { width: auto; min-height: 0; margin-top: 6px; padding: 6px 14px !important; border-radius: 999px; background: #b7e6d30a; color: var(--ml-jade); }
```

### src/library/suites/mobile/mobileRecommendations.css
```
35: background: #172320;
77: color: #fff;
82: text-shadow: 0 1px 12px #140b3350;
93: background: #fff9;
99: color: #fffdf2d9;
103: text-shadow: 0 1px 8px #23113666;
116: border: 1px solid #ffffff45;
118: background: #ffffff30;
119: color: #fff;
122: box-shadow: inset 0 1px #ffffff22;
127: color: #ffffffcf;
128: background: #17132c58;
142: background: #ffffff38;
146: background: #f1f5f2;
```

### src/components/modal/sleepTimerSheet.css
```
1: .sleep-scrim{position:fixed;inset:0;z-index:250;background:#0008;display:flex;align-items:flex-end;justify-content:center;color:var(--text-primary,#eaf6ef)}.sleep-sheet{width:100%;max-width:560px;max-height:90dvh;overflow:auto;overscroll-behavior:contain;background:var(--mps-glass,#122820);border:1px solid var(--mps-border,#ffffff22);border-radius:28px 28px 0 0;padding:24px 20px calc(24px + env(safe-area-inset-bottom));display:grid;gap:20px;box-shadow:0 -10px 60px #0003;animation:sleep-rise .3s cubic-bezier(.2,.8,.2,1)}.sleep-sheet header{display:flex;justify-content:space-between;gap:12px}.sleep-sheet h2{display:flex;align-items:center;gap:9px;font-size:1.25rem;font-weight:650}.sleep-sheet p{font-size:.875rem;color:var(--text-secondary,#afc8ba);line-height:1.6;margin-top:5px}.sleep-sheet button{min-height:46px;border-radius:14px;padding:10px 12px;touch-action:manipulation}.sleep-sheet button:disabled{opacity:.5}.sleep-modes{display:grid;gap:8px}.sleep-modes button{display:flex;justify-content:space-between;text-align:left;gap:12px;background:color-mix(in srgb,currentColor 4%,transparent);border:1px solid color-mix(in srgb,currentColor 12%,transparent)}.sleep-modes [aria-checked=true],.sleep-presets [aria-pressed=true]{border-color:var(--accent-color,#86ccb3);background:color-mix(in srgb,var(--accent-color,#86ccb3) 15%,transparent)}.sleep-presets{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px}.sleep-presets button{border:1px solid color-mix(in srgb,currentColor 12%,transparent)}.sleep-custom{display:flex;gap:16px}.sleep-custom label{min-width:0;flex:1}.sleep-custom input{display:block;width:100%;min-height:46px;background:transparent;border:1px solid currentColor;border-radius:12px;padding:8px;margin-top:6px}.sleep-start{background:var(--accent-color,#86ccb3);color:#10251b;font-weight:650}.sleep-running{text-align:center;border-radius:20px;padding:16px;background:color-mix(in srgb,currentColor 5%,transparent)}.sleep-running strong{display:block;font-size:2.5rem;font-variant-numeric:tabular-nums}.sleep-running progress{width:100%;height:6px;accent-color:var(--accent-color,#86ccb3)}.sleep-running button{margin-top:10px;border:1px solid color-mix(in srgb,currentColor 20%,transparent)}@keyframes sleep-rise{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}@media(prefers-reduced-motion:reduce){.sleep-sheet{animation:none}}
```

### src/components/modal/settings/mobileSettings.css
```
5: background: #031510;
6: --ty-settings-line: rgba(165, 205, 185, .12);
7: --ty-settings-muted: #9eb3aa;
8: --ty-settings-mint: #74d9ba;
13: background: radial-gradient(ellipse at 14% -12%, #12453680, transparent 53%),
14: linear-gradient(155deg, #061d16, #02120e 64%, #041a13);
40: padding: 0; border: 0; border-radius: 50%; color: #e5eee9; background: transparent;
42: [data-mobile-settings='true'] .ty-settings-header > .ty-settings-close { background: #99bba50b; }
52: color: #acbfb6; font-size: 13px; line-height: 20px; font-weight: 500;
55: background: linear-gradient(125deg, #23493b33, #14362926);
57: box-shadow: inset 0 1px 0 #d9ffe805, 0 4px 12px #0011090a;
68: content: ''; position: absolute; left: 62px; right: 14px; top: 0; border-top: 1px solid #a5cdb90c;
72: border-radius: 50%; background: #a6d7bf0c; color: #d2e3da;
77: [data-mobile-settings='true'] .ty-settings-row > svg { flex: none; color: #c7d7ce; }
88: -webkit-mask-image: linear-gradient(to right, #000 58%, #0008 82%, transparent);
89: mask-image: linear-gradient(to right, #000 58%, #0008 82%, transparent);
98: color: #e0f8ed; background: linear-gradient(120deg, #387a60, #255a48); border: 1px solid #7fc2a51a;
107: [data-mobile-settings='true'] .ty-settings-row-copy .ty-rear-status-failed { color: #e5b897; }
111: position: relative; box-sizing: border-box; flex: none; width: 44px; height: 24px; padding: 3px; border: 0; border-radius: 20px; background: #333a3b;
113: [data-mobile-settings='true'] .ty-settings-switch[aria-checked='true'] { background: #409b7b; }
116: box-shadow: 0 1px 2px #0002; transform: translateX(0); transition: transform 180ms ease;
122: [data-mobile-settings='true'] .ty-settings-row:active { background: #a3d9bc09; }
125: outline: 2px solid #82caae; outline-offset: 2px;
```

### src/components/modal/settings/rearControl.css
```
2: .ty-rear-center[data-rear-page] {color:var(--text-primary,#e8f4ed);padding-bottom:24px;}
6: .ty-rear-center[data-rear-page] .ty-settings-card>.ty-settings-row+.ty-settings-row {border-top:1px solid var(--ty-settings-line,#a5cdb91f);}
13: .ty-rear-center[data-rear-page] .ty-settings-row-copy small,.ty-rear-footnote,.ty-rear-notice {color:var(--ty-settings-muted,#9eb3aa);opacity:1;}
14: .ty-rear-choices {display:flex;gap:4px;padding:4px;border-radius:14px;background:var(--ui-subtle,#99bba50b);border:1px solid var(--ty-settings-line,#a5cdb91f);}
16: .ty-rear-choices button[aria-pressed='true'] {background:var(--ui-selected,#74d9ba1a);border-color:var(--ui-selected-border,#74d9ba40);color:var(--ty-settings-mint,#74d9ba);font-weight:600;}
20: .ty-rear-fact {color:var(--ty-settings-muted,#9eb3aa);text-align:right;font-size:.8125rem;line-height:1.5;max-width:55%;overflow-wrap:anywhere;}
22: .ty-rear-center[data-rear-page] :focus-visible,.ty-rear-entry:focus-visible {outline:2px solid var(--ty-settings-mint,#74d9ba);outline-offset:3px;}
23: html[data-interface-appearance='light'] .ty-rear-choices {background:#315d4310;}
24: html[data-interface-appearance='light'] .ty-rear-choices button[aria-pressed='true'] {background:#32785620;border-color:#32785666;color:var(--ui-ink,#213e34);}
37: .ty-stage-theme-entry {flex:none;display:flex;align-items:center;gap:12px;min-height:52px;padding:12px 16px;color:var(--text-primary,#e8f4ed);text-align:left;}
59: .ty-rear-import textarea {display:block;box-sizing:border-box;width:100%;min-height:120px;margin-top:10px;padding:12px;color:inherit;background:var(--ui-subtle,#99bba50b);border:1px solid var(--ty-settings-line);border-radius:12px;resize:vertical;}
```

### src/components/modal/settings/resourceCacheSettings.css
```
2: .storage-settings,.resource-card{--storage-accent:var(--accent-color,#75bba6);--storage-line:color-mix(in srgb,var(--text-primary) 10%,transparent);--storage-surface:color-mix(in srgb,var(--text-primary) 4%,transparent);color:var(--text-primary);min-width:0}
16: .storage-settings button:disabled,.resource-card button:disabled{opacity:.45}.storage-settings button:focus-visible,.resource-card button:focus-visible{outline:2px solid var(--storage-accent);outline-offset:3px}.storage-error{color:var(--error-color,#d16f66);font-size:.8rem;line-height:1.6}.storage-danger{color:var(--text-secondary)}
```

### src/components/app/search/searchWorkspace.css
```
3: --ty-bg: #03110c;
4: --ty-panel: #ffffff08;
5: --ty-panel-strong: #ffffff0e;
6: --ty-border: #ffffff12;
7: --ty-text: #eef5ef;
8: --ty-muted: #9db0a7;
9: --ty-accent: #9fe0c4;
10: --ty-accent-soft: #9fe0c42e;
20: background: linear-gradient(165deg, color-mix(in srgb, var(--ty-bg) 94%, #20432d) 0%, var(--ty-bg) 42%);
24: --ty-bg: #f4f6f1;
25: --ty-panel: #101c1610;
26: --ty-panel-strong: #101c1618;
27: --ty-border: #101c1624;
28: --ty-text: #12271e;
29: --ty-muted: #5c7066;
30: --ty-accent: #22775a;
31: --ty-accent-soft: #22775a1f;
43: box-shadow: 0 0 0 1px color-mix(in srgb, var(--ty-accent) 28%, transparent), 0 6px 20px #00000024;
```

## Reviewed ordinary CSS recipe ownership

Artistic hero/poster/recent-cover rules, URL artwork, and mask math remain independent.

~~~
src/styles/mobileGlass.css:38 .mobile-library.ml-footer nav button[aria-current='page']:not([disabled]) / background → mobile-glass-background-1 [surface]
src/styles/mobileGlass.css:39 .mobile-library.ml-footer nav button[aria-current='page']:not([disabled]) / border → mobile-glass-border-1 [border]
src/styles/mobileGlass.css:40 .mobile-library.ml-footer nav button[aria-current='page']:not([disabled]) / box-shadow → mobile-glass-box-shadow-1 [shadow]
src/styles/mobileGlass.css:58 .mobile-library.ml-footer nav button[aria-current='page'] / color → mobile-glass-color-1 [ink]
src/styles/mobileGlass.css:76 .mobile-library.ml-footer > [data-soft-glass],
.mobile-player-stage .mps-player[data-soft-glass] / box-shadow → mobile-glass-box-shadow-2 [shadow]
src/styles/mobileGlass.css:118 .ml-mini-progress-track / stroke → mobile-glass-stroke-1 [border]
src/library/suites/mobile/mobileLibrary.css:4 .mobile-library / --ml-bg → mobile-library-ml-bg-1 [background]
src/library/suites/mobile/mobileLibrary.css:5 .mobile-library / --ml-ink → mobile-library-ml-ink-1 [ink]
src/library/suites/mobile/mobileLibrary.css:6 .mobile-library / --ml-muted → mobile-library-ml-muted-1 [muted]
src/library/suites/mobile/mobileLibrary.css:7 .mobile-library / --ml-jade → mobile-library-ml-jade-1 [accent]
src/library/suites/mobile/mobileLibrary.css:8 .mobile-library / --ml-line → mobile-library-ml-line-1 [border]
src/library/suites/mobile/mobileLibrary.css:9 .mobile-library / --ml-surface → mobile-library-ml-surface-1 [surface]
src/library/suites/mobile/mobileLibrary.css:51 .ml-scroll-cue / background → mobile-library-background-1 [background]
src/library/suites/mobile/mobileLibrary.css:196 .ml-home / background → mobile-library-background-2 [background]
src/library/suites/mobile/mobileLibrary.css:199 .ml-home[data-page='home'] / --ml-home-base → mobile-library-ml-home-base-1 [background]
src/library/suites/mobile/mobileLibrary.css:200 .ml-home[data-page='home'] / --ml-home-muted → mobile-library-ml-home-muted-1 [muted]
src/library/suites/mobile/mobileLibrary.css:212 .ml-home[data-page='home'] / background → mobile-library-background-3 [background]
src/library/suites/mobile/mobileLibrary.css:248 to / background-color → mobile-library-background-color-1 [background]
src/library/suites/mobile/mobileLibrary.css:275 .mobile-library .ml-icon:hover,
    .ml-footer nav button:hover / background → mobile-library-background-4 [surface]
src/library/suites/mobile/mobileLibrary.css:278 .ml-song-row:hover / background → mobile-library-background-5 [surface]
src/library/suites/mobile/mobileLibrary.css:326 .ml-home[data-page='home'] .ml-home-heading p / color → mobile-library-color-1 [ink]
src/library/suites/mobile/mobileLibrary.css:346 .ml-home[data-page='home'] .ml-source,
.ml-home[data-page='library'] .ml-source / border → mobile-library-border-1 [border]
src/library/suites/mobile/mobileLibrary.css:348 .ml-home[data-page='home'] .ml-source,
.ml-home[data-page='library'] .ml-source / background → mobile-library-background-6 [background]
src/library/suites/mobile/mobileLibrary.css:398 .mobile-library .ml-home-all / border → mobile-library-border-2 [border]
src/library/suites/mobile/mobileLibrary.css:400 .mobile-library .ml-home-all / color → mobile-library-color-2 [ink]
src/library/suites/mobile/mobileLibrary.css:401 .mobile-library .ml-home-all / background → mobile-library-background-7 [background]
src/library/suites/mobile/mobileLibrary.css:447 .ml-feature-caption / background → mobile-library-background-8 [background]
src/library/suites/mobile/mobileLibrary.css:471 .ml-feature-caption p / color → mobile-library-color-3 [ink]
src/library/suites/mobile/mobileLibrary.css:480 .mobile-library .ml-play / color → mobile-library-color-4 [ink]
src/library/suites/mobile/mobileLibrary.css:534 .ml-recent-full > button / border-bottom → mobile-library-border-bottom-1 [border]
src/library/suites/mobile/mobileLibrary.css:582 .mobile-library .ml-home-playlist-card / border → mobile-library-border-3 [border]
src/library/suites/mobile/mobileLibrary.css:584 .mobile-library .ml-home-playlist-card / background → mobile-library-background-9 [surface]
src/library/suites/mobile/mobileLibrary.css:618 .mobile-library .ml-home-more / color → mobile-library-color-5 [ink]
src/library/suites/mobile/mobileLibrary.css:684 .mobile-library .ml-tabs button[aria-pressed='true'] / background → mobile-library-background-10 [surface]
src/library/suites/mobile/mobileLibrary.css:770 .ml-mini / border → mobile-library-border-4 [border]
src/library/suites/mobile/mobileLibrary.css:772 .ml-mini / background → mobile-library-background-11 [background]
src/library/suites/mobile/mobileLibrary.css:775 .ml-mini / box-shadow → mobile-library-box-shadow-1 [shadow]
src/library/suites/mobile/mobileLibrary.css:825 .ml-footer nav / border → mobile-library-border-5 [border]
src/library/suites/mobile/mobileLibrary.css:827 .ml-footer nav / background → mobile-library-background-12 [background]
src/library/suites/mobile/mobileLibrary.css:830 .ml-footer nav / box-shadow → mobile-library-box-shadow-2 [shadow]
src/library/suites/mobile/mobileLibrary.css:839 .mobile-library.ml-footer nav button / color → mobile-library-color-6 [ink]
src/library/suites/mobile/mobileLibrary.css:849 .mobile-library.ml-footer nav button[aria-current='page'] / background → mobile-library-background-13 [surface]
src/library/suites/mobile/mobileLibrary.css:853 .ml-footer nav button[aria-current='page'] svg / fill → mobile-library-fill-1 [surface]
src/library/suites/mobile/mobileLibrary.css:944 .mobile-library .ml-locate-current / border → mobile-library-border-6 [border]
src/library/suites/mobile/mobileLibrary.css:945 .mobile-library .ml-locate-current / background → mobile-library-background-14 [background]
src/library/suites/mobile/mobileLibrary.css:947 .mobile-library .ml-locate-current / box-shadow → mobile-library-box-shadow-3 [shadow]
src/library/suites/mobile/mobileLibrary.css:955 0%, 30% / background → mobile-library-background-15 [background]
src/library/suites/mobile/mobileLibrary.css:1061 .ml-sheet-scrim / background → mobile-library-background-16 [sheet]
src/library/suites/mobile/mobileLibrary.css:1073 .ml-sheet / box-shadow → mobile-library-box-shadow-4 [shadow]
src/library/suites/mobile/mobileLibrary.css:1129 .mobile-library .ml-solid / color → mobile-library-color-7 [ink]
src/library/suites/mobile/mobileLibrary.css:1134 .ml-error / color → mobile-library-color-8 [danger]
src/library/suites/mobile/mobileLibrary.css:1252 .ml-quality-text[data-level="hq"] / color → mobile-library-color-9 [ink]
src/library/suites/mobile/mobileLibrary.css:1253 .ml-quality-text[data-level="flac"] / color → mobile-library-color-10 [ink]
src/library/suites/mobile/mobileLibrary.css:1254 .ml-quality-text[data-level="hires"] / color → mobile-library-color-11 [ink]
src/library/suites/mobile/mobileLibrary.css:1255 .ml-quality-text[data-level="master"] / color → mobile-library-color-12 [ink]
src/library/suites/mobile/mobileLibrary.css:1256 .ml-quality-text[data-level="spatial"] / color → mobile-library-color-13 [ink]
src/library/suites/mobile/mobileLibraryPage.css:5 .ml-home[data-page='library'] / --ml-bg → mobile-library-page-ml-bg-1 [background]
src/library/suites/mobile/mobileLibraryPage.css:10 .ml-home[data-page='library'] / background-image → mobile-library-page-background-image-1 [surface]
src/library/suites/mobile/mobileLibraryPage.css:22 .ml-home[data-page='library'] .ml-tabs button[aria-pressed='true'] / background → mobile-library-page-background-1 [surface]
src/library/suites/mobile/mobileLibraryPage.css:22 .ml-home[data-page='library'] .ml-tabs button[aria-pressed='true'] / color → mobile-library-page-color-1 [ink]
src/library/suites/mobile/mobileLibraryPage.css:26 .ml-home[data-page='library'] .ml-filter / border → mobile-library-page-border-1 [border]
src/library/suites/mobile/mobileLibraryPage.css:26 .ml-home[data-page='library'] .ml-filter / background → mobile-library-page-background-2 [surface]
src/library/suites/mobile/mobileLibraryPage.css:28 .ml-home[data-page='library'] .ml-filter:focus-within / border-color → mobile-library-page-border-color-1 [border]
src/library/suites/mobile/mobileLibraryPage.css:28 .ml-home[data-page='library'] .ml-filter:focus-within / box-shadow → mobile-library-page-box-shadow-1 [shadow]
src/library/suites/mobile/mobileLibraryPage.css:31 .ml-home[data-page='library'] .ml-directory-sort / color → mobile-library-page-color-2 [ink]
src/library/suites/mobile/mobileLibraryPage.css:33 .ml-home[data-page='library'] .ml-directory-sort option / color → mobile-library-page-color-3 [ink]
src/library/suites/mobile/mobileLibraryPage.css:33 .ml-home[data-page='library'] .ml-directory-sort option / background → mobile-library-page-background-3 [background]
src/library/suites/mobile/mobileLibraryPage.css:39 .ml-home[data-page='library'] .ml-card-row small / color → mobile-library-page-color-4 [muted]
src/library/suites/mobile/mobileLibraryPage.css:40 .ml-home[data-page='library'] .ml-card-row > svg / color → mobile-library-page-color-5 [ink]
src/library/suites/mobile/mobileLibraryPage.css:41 .ml-home[data-page='library'] .ml-card-row:active / background → mobile-library-page-background-4 [surface]
src/library/suites/mobile/mobileRecommendations.css:142 .mobile-library .ml-feature-dots button / background → mobile-recommendations-background-1 [surface]
src/library/suites/mobile/mobileRecommendations.css:146 .mobile-library .ml-feature-dots button[aria-current="true"] / background → mobile-recommendations-background-2 [surface]
src/library/suites/mobile/mobilePlaylistDetail.css:3 .mobile-library.ml-playlist-detail / --ml-bg → mobile-playlist-detail-ml-bg-1 [background]
src/library/suites/mobile/mobilePlaylistDetail.css:4 .mobile-library.ml-playlist-detail / --ml-muted → mobile-playlist-detail-ml-muted-1 [muted]
src/library/suites/mobile/mobilePlaylistDetail.css:5 .mobile-library.ml-playlist-detail / --ml-jade → mobile-playlist-detail-ml-jade-1 [accent]
src/library/suites/mobile/mobilePlaylistDetail.css:10 .mobile-library.ml-playlist-detail / background-image → mobile-playlist-detail-background-image-1 [surface]
src/library/suites/mobile/mobilePlaylistDetail.css:44 .ml-playlist-detail .ml-playlist-cover / box-shadow → mobile-playlist-detail-box-shadow-1 [shadow]
src/library/suites/mobile/mobilePlaylistDetail.css:60 .ml-playlist-detail .ml-playlist-play / background → mobile-playlist-detail-background-1 [background]
src/library/suites/mobile/mobilePlaylistDetail.css:60 .ml-playlist-detail .ml-playlist-play / color → mobile-playlist-detail-color-1 [ink]
src/library/suites/mobile/mobilePlaylistDetail.css:62 .ml-playlist-detail .ml-playlist-action / background → mobile-playlist-detail-background-2 [background]
src/library/suites/mobile/mobilePlaylistDetail.css:62 .ml-playlist-detail .ml-playlist-action / color → mobile-playlist-detail-color-2 [ink]
src/library/suites/mobile/mobilePlaylistDetail.css:71 .ml-playlist-detail .ml-song-row::after / background → mobile-playlist-detail-background-3 [surface]
src/library/suites/mobile/mobilePlaylistDetail.css:72 .ml-playlist-detail .ml-song-row[data-first='true'] / border-top → mobile-playlist-detail-border-top-1 [border]
src/library/suites/mobile/mobilePlaylistDetail.css:79 .ml-playlist-detail .ml-song-row.is-current / background → mobile-playlist-detail-background-4 [surface]
src/library/suites/mobile/mobilePlaylistDetail.css:90 .ml-playlist-detail .ml-error button / background → mobile-playlist-detail-background-5 [danger]
src/components/modal/settings/mobileSettings.css:5 [data-folia-settings-overlay][data-mobile-settings='true'] / background → mobile-settings-background-1 [background]
src/components/modal/settings/mobileSettings.css:6 [data-folia-settings-overlay][data-mobile-settings='true'] / --ty-settings-line → mobile-settings-ty-settings-line-1 [border]
src/components/modal/settings/mobileSettings.css:7 [data-folia-settings-overlay][data-mobile-settings='true'] / --ty-settings-muted → mobile-settings-ty-settings-muted-1 [muted]
src/components/modal/settings/mobileSettings.css:8 [data-folia-settings-overlay][data-mobile-settings='true'] / --ty-settings-mint → mobile-settings-ty-settings-mint-1 [accent]
src/components/modal/settings/mobileSettings.css:13 [data-mobile-settings='true'] > [data-folia-settings-panel] / background → mobile-settings-background-2 [background]
src/components/modal/settings/mobileSettings.css:40 [data-mobile-settings='true'] .ty-settings-header > button / color → mobile-settings-color-1 [ink]
src/components/modal/settings/mobileSettings.css:42 [data-mobile-settings='true'] .ty-settings-header > .ty-settings-close / background → mobile-settings-background-3 [background]
src/components/modal/settings/mobileSettings.css:52 [data-mobile-settings='true'] .ty-settings-group-title / color → mobile-settings-color-2 [ink]
src/components/modal/settings/mobileSettings.css:55 [data-mobile-settings='true'] .ty-settings-card / background → mobile-settings-background-4 [surface]
src/components/modal/settings/mobileSettings.css:57 [data-mobile-settings='true'] .ty-settings-card / box-shadow → mobile-settings-box-shadow-1 [shadow]
src/components/modal/settings/mobileSettings.css:68 [data-mobile-settings='true'] .ty-settings-row + .ty-settings-row::before / border-top → mobile-settings-border-top-1 [border]
src/components/modal/settings/mobileSettings.css:72 [data-mobile-settings='true'] .ty-setting-symbol / background → mobile-settings-background-5 [background]
src/components/modal/settings/mobileSettings.css:72 [data-mobile-settings='true'] .ty-setting-symbol / color → mobile-settings-color-3 [ink]
src/components/modal/settings/mobileSettings.css:77 [data-mobile-settings='true'] .ty-settings-row > svg / color → mobile-settings-color-4 [ink]
src/components/modal/settings/mobileSettings.css:98 [data-mobile-settings='true'] .ty-rear-toggle / color → mobile-settings-color-5 [ink]
src/components/modal/settings/mobileSettings.css:98 [data-mobile-settings='true'] .ty-rear-toggle / background → mobile-settings-background-6 [background]
src/components/modal/settings/mobileSettings.css:98 [data-mobile-settings='true'] .ty-rear-toggle / border → mobile-settings-border-1 [border]
src/components/modal/settings/mobileSettings.css:107 [data-mobile-settings='true'] .ty-settings-row-copy .ty-rear-status-failed / color → mobile-settings-color-6 [ink]
src/components/modal/settings/mobileSettings.css:111 [data-mobile-settings='true'] .ty-settings-switch / background → mobile-settings-background-7 [background]
src/components/modal/settings/mobileSettings.css:113 [data-mobile-settings='true'] .ty-settings-switch[aria-checked='true'] / background → mobile-settings-background-8 [background]
src/components/modal/settings/mobileSettings.css:116 [data-mobile-settings='true'] .ty-settings-switch-thumb / box-shadow → mobile-settings-box-shadow-2 [shadow]
src/components/modal/settings/mobileSettings.css:122 [data-mobile-settings='true'] .ty-settings-row:active / background → mobile-settings-background-9 [surface]
src/components/modal/settings/mobileSettings.css:125 [data-mobile-settings='true'] button:focus-visible, [data-mobile-settings='true'] summary:focus-visible / outline → mobile-settings-outline-1 [border]
src/components/app/search/searchWorkspace.css:3 .ty-search / --ty-bg → search-workspace-ty-bg-1 [background]
src/components/app/search/searchWorkspace.css:4 .ty-search / --ty-panel → search-workspace-ty-panel-1 [surface]
src/components/app/search/searchWorkspace.css:5 .ty-search / --ty-panel-strong → search-workspace-ty-panel-strong-1 [surface]
src/components/app/search/searchWorkspace.css:6 .ty-search / --ty-border → search-workspace-ty-border-1 [border]
src/components/app/search/searchWorkspace.css:7 .ty-search / --ty-text → search-workspace-ty-text-1 [ink]
src/components/app/search/searchWorkspace.css:8 .ty-search / --ty-muted → search-workspace-ty-muted-1 [muted]
src/components/app/search/searchWorkspace.css:9 .ty-search / --ty-accent → search-workspace-ty-accent-1 [accent]
src/components/app/search/searchWorkspace.css:10 .ty-search / --ty-accent-soft → search-workspace-ty-accent-soft-1 [accent]
src/components/app/search/searchWorkspace.css:20 .ty-search / background → search-workspace-background-1 [background]
src/components/app/search/searchWorkspace.css:24 .ty-search[data-light='true'] / --ty-bg → search-workspace-ty-bg-2 [background]
src/components/app/search/searchWorkspace.css:25 .ty-search[data-light='true'] / --ty-panel → search-workspace-ty-panel-2 [surface]
src/components/app/search/searchWorkspace.css:26 .ty-search[data-light='true'] / --ty-panel-strong → search-workspace-ty-panel-strong-2 [surface]
src/components/app/search/searchWorkspace.css:27 .ty-search[data-light='true'] / --ty-border → search-workspace-ty-border-2 [border]
src/components/app/search/searchWorkspace.css:28 .ty-search[data-light='true'] / --ty-text → search-workspace-ty-text-2 [ink]
src/components/app/search/searchWorkspace.css:29 .ty-search[data-light='true'] / --ty-muted → search-workspace-ty-muted-2 [muted]
src/components/app/search/searchWorkspace.css:30 .ty-search[data-light='true'] / --ty-accent → search-workspace-ty-accent-2 [accent]
src/components/app/search/searchWorkspace.css:31 .ty-search[data-light='true'] / --ty-accent-soft → search-workspace-ty-accent-soft-2 [accent]
src/components/app/search/searchWorkspace.css:43 .ty-search-field:focus-within / box-shadow → search-workspace-box-shadow-1 [shadow]
~~~
