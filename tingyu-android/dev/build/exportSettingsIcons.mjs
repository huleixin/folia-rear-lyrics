import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';

// dev/build/exportSettingsIcons.mjs
// Export the same installed Lucide geometry as the settings source, including renamed aliases.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = path.join(root, 'android/app/src/main/res/raw/native_page_icons.json');
const definitions = JSON.parse(fs.readFileSync(target, 'utf8'));
const files = [];
function scan(directory) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
        const file = `${directory}/${entry.name}`;
        if (entry.isDirectory()) scan(file);
        else if (file.endsWith('.tsx')) files.push(file);
    }
}
for (const directory of ['src/components/modal', 'src/components/visualizer', 'src/components/shared']) scan(directory);
files.push('src/components/panelTab/ThemeQuickEditor.tsx');
const names = new Set();
for (const file of files) {
    const ast = parse(fs.readFileSync(path.join(root, file), 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    for (const item of ast.program.body) if (item.type === 'ImportDeclaration' && item.source.value === 'lucide-react') {
        for (const specifier of item.specifiers) if (specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type') names.add(specifier.imported.name);
    }
}
for (const name of [...names].sort()) {
    const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Za-z])(\d)/g, '$1-$2').toLowerCase();
    const file = path.join(root, 'node_modules/lucide-react/dist/esm/icons', `${kebab}.mjs`);
    if (!fs.existsSync(file)) continue; // Types (LucideIcon etc.) have no geometry.
    let moduleFile = file;
    let data;
    for (let depth=0; depth<4; depth++) {
        data = (await import(pathToFileURL(moduleFile).href)).__iconData;
        if(data)break;
        const alias = fs.readFileSync(moduleFile,'utf8').match(/from ['"](\.\/[^'"]+)['"]/);
        if(!alias)break;
        moduleFile = path.resolve(path.dirname(moduleFile),alias[1]);
    }
    if (!data?.node) throw Error(`Missing Lucide geometry: ${name}`);
    definitions[data.name] = data.node.map(([kind, attributes]) => [kind, Object.fromEntries(Object.entries(attributes).filter(([key]) => key !== 'key'))]);
}
fs.writeFileSync(target, `${JSON.stringify(definitions)}\n`);
console.log(`Exported ${Object.keys(definitions).length} native Lucide definitions`);
