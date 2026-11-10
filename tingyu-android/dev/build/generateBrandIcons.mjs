import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

// Reproduce Android assets from the supplied SVG, separating background from wave artwork.
const res = resolve('android/app/src/main/res');
const source = readFileSync('public/brand/logo-symbol.svg', 'utf8');
const paths = [...source.matchAll(/<path\b[^>]*\/>/g)].map(match => match[0]);
if (paths.length !== 4) throw new Error('Expected four supplied wave paths');
const attr = (tag, name, fallback = '') => tag.match(new RegExp(name + '="([^"]+)"'))?.[1] ?? fallback;
const vectorPaths = paths.map(tag => '  <path android:pathData="' + attr(tag, 'd') +
  '" android:fillColor="' + attr(tag, 'fill', '#00000000').replace('none', '#00000000') +
  '" android:fillAlpha="' + attr(tag, 'opacity', '1') + '"' +
  (attr(tag, 'stroke') ? ' android:strokeColor="' + attr(tag, 'stroke') + '" android:strokeWidth="' + attr(tag, 'stroke-width') +
   '" android:strokeAlpha="' + attr(tag, 'opacity', '1') + '" android:strokeLineCap="round"' : '') + ' />').join('\n');
const vector = body => '<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated from public/brand/logo-symbol.svg. -->\n<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt" android:width="108dp" android:height="108dp" android:viewportWidth="120" android:viewportHeight="120">\n' + body + '\n</vector>\n';
const write = (name, data) => { const file = resolve(res, name); mkdirSync(resolve(file, '..'), {recursive:true}); writeFileSync(file,data); };
// Android expands adaptive layers by 1.5x. Compensate here so the supplied wave
// keeps its original proportions inside the mask instead of becoming a cropped close-up.
write('drawable/ic_launcher_foreground.xml',vector('  <group android:scaleX="0.6666667" android:scaleY="0.6666667" android:translateX="20" android:translateY="20">\n' + vectorPaths + '\n  </group>'));
write('drawable/ic_launcher_background.xml',vector('  <path android:pathData="M0,0h120v120h-120z">\n    <aapt:attr name="android:fillColor"><gradient android:startX="0" android:startY="0" android:endX="120" android:endY="120" android:type="linear">\n      <item android:offset="0" android:color="#DDEDFB" /><item android:offset="0.5" android:color="#A8CAE8" /><item android:offset="1" android:color="#669CCB" />\n    </gradient></aapt:attr>\n  </path>'));
// Monochrome reuses the strokes inside the guaranteed 66dp safe circle.
write('drawable/ic_tingyu_monochrome.xml',vector('  <group android:scaleX="0.44" android:scaleY="0.44" android:translateX="33.6" android:translateY="33.6">\n    <clip-path android:pathData="M28,0h64a28,28 0,0 1,28,28v64a28,28 0,0 1,-28,28h-64a28,28 0,0 1,-28,-28v-64a28,28 0,0 1,28,-28z" />\n' + vectorPaths.split('\n').slice(2).map(line=>line.replace(/#F6FBFF/g,'#FFFFFF').replace(/strokeAlpha=".65"/g,'strokeAlpha="1"')).join('\n')+'\n  </group>'));
const adaptive = '<?xml version="1.0" encoding="utf-8"?>\n<!-- Full-bleed ice background; central S curve remains visible under launcher masks. -->\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@drawable/ic_launcher_background" />\n  <foreground android:drawable="@drawable/ic_launcher_foreground" />\n  <monochrome android:drawable="@drawable/ic_tingyu_monochrome" />\n</adaptive-icon>\n';
for (const name of ['ic_launcher','ic_launcher_round']) write('mipmap-anydpi-v26/'+name+'.xml',adaptive);
const round = source.replace('<rect width="120" height="120" rx="28" ry="28"/>','<circle cx="60" cy="60" r="60"/>');
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
const page = await browser.newPage();
for (const [density,size] of Object.entries({ldpi:36,mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192})) {
  await page.setViewportSize({width:size,height:size});
  for (const [name,svg] of [['ic_launcher',source],['ic_launcher_round',round]]) {
    await page.setContent('<style>html,body{margin:0;width:100%;height:100%}svg{width:100%;height:100%;display:block}</style>'+svg);
    write('mipmap-'+density+'/'+name+'.png',await page.screenshot({omitBackground:true}));
  }
}
await browser.close();
console.log('Generated split adaptive, monochrome and six legacy density icons');
