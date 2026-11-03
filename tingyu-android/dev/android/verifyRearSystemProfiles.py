import hashlib
import json
import re
import struct
import sys
import zipfile
from pathlib import Path

# dev/android/verifyRearSystemProfiles.py
# Read-only DEX declaration audit of user-supplied APKs; no Android code execution or source copying.
def uleb(data, pos):
    value = shift = 0
    while True:
        byte = data[pos]; pos += 1
        value |= (byte & 127) << shift
        if byte < 128: return value, pos
        shift += 7

def declarations(data):
    u32 = lambda offset: struct.unpack_from('<I', data, offset)[0]
    strings = []
    for i in range(u32(56)):
        _, pos = uleb(data, u32(u32(60) + 4*i))
        strings.append(data[pos:data.index(0, pos)].decode('utf-8', errors='replace'))
    types = [strings[u32(u32(68)+4*i)] for i in range(u32(64))]
    def type_list(offset):
        return [types[struct.unpack_from('<H', data, offset+4+2*i)[0]] for i in range(u32(offset))] if offset else []
    protos = [(types[u32(u32(76)+12*i+4)], type_list(u32(u32(76)+12*i+8))) for i in range(u32(72))]
    fields = []
    for i in range(u32(80)):
        owner, kind, name = struct.unpack_from('<HHI', data, u32(84)+8*i)
        fields.append((strings[name], types[kind]))
    methods = []
    for i in range(u32(88)):
        owner, proto, name = struct.unpack_from('<HHI', data, u32(92)+8*i)
        methods.append((strings[name], protos[proto]))
    result = {}
    for i in range(u32(96)):
        start = u32(100)+32*i; pos = u32(start+24)
        if not pos: continue
        counts = []
        for _ in range(4): count, pos = uleb(data, pos); counts.append(count)
        defined_fields = {}; defined_methods = {}
        for count in counts[:2]:
            index = 0
            for _ in range(count):
                delta, pos = uleb(data, pos); access, pos = uleb(data, pos); index += delta
                name, kind = fields[index]; defined_fields[name] = (kind, access)
        for count in counts[2:]:
            index = 0
            for _ in range(count):
                delta, pos = uleb(data, pos); access, pos = uleb(data, pos); _, pos = uleb(data, pos); index += delta
                name, (kind, args) = methods[index]; defined_methods[(name, tuple(args))] = (kind, access)
        result[types[u32(start)]] = {'fields': defined_fields, 'methods': defined_methods}
    return result

def verify(apk, version):
    source = Path(__file__).resolve().parents[2] / 'android/app/src/main/java/io/github/huleixin/tingyu/RearSystemCardProfile.java'
    profiles = {int(v): re.findall(r'"([^"]*)"', args) for v, args in re.findall(r'new RearSystemCardProfile\((\d+)L,([^;]+)\);', source.read_text(encoding='utf-8'))}
    values = profiles[version]
    bind, holder, widget, gate, manager, entry, service, incoming, update, collapse, expand, remove, switches, entry_data = values
    classes = {}
    with zipfile.ZipFile(apk) as archive:
        for name in archive.namelist():
            if re.fullmatch(r'classes\d*\.dex', name): classes.update(declarations(archive.read(name)))
    descriptor = lambda name: 'L'+name.replace('.', '/')+';'
    aliases = {'Landroid/view/ViewGroup;': {'Landroid/widget/FrameLayout;'}, 'Ljava/util/List;': {'Ljava/util/ArrayList;'}, 'Ljava/util/Map;': {'Ljava/util/concurrent/ConcurrentHashMap;', 'Ljava/util/HashMap;'}, 'Ljava/util/Set;': {'Ljava/util/HashSet;'}}
    errors = []; checks = 0
    def match(actual, expected): return actual == expected or actual in aliases.get(expected, set())
    def field(owner, name, expected):
        nonlocal checks
        checks += 1; found = classes.get(descriptor(owner), {}).get('fields', {}).get(name)
        if not found or not match(found[0], expected) or found[1] & 8: errors.append(f'{owner}.{name}: field mismatch ({found})')
    def method(owner, name, args, expected, static=False):
        nonlocal checks
        checks += 1; found = classes.get(descriptor(owner), {}).get('methods', {}).get((name, tuple(args)))
        if not found or not match(found[0], expected) or static and not found[1] & 8: errors.append(f'{owner}.{name}{args}: method mismatch ({found})')
    bundle = descriptor('android.os.Bundle')
    panel = 'com.xiaomi.subscreencenter.SmartAssistantPanel'
    method(panel, bind, ['I']*4+[descriptor('java.lang.Runnable')], 'V')
    field(panel, 'i', descriptor('java.util.List')); field(panel, 'x', 'Z')
    field(holder, 'a', descriptor('android.widget.FrameLayout')); field(holder, 'b', descriptor(widget))
    for name, kind in [('n', 'android.view.View'), ('p', 'android.view.ViewGroup'), ('i', 'android.os.Bundle')]: field(widget, name, descriptor(kind))
    for name, args in [(update, [descriptor('java.lang.String'), bundle]), (collapse, ['Z']), (expand, []), (remove, [])]: method(manager, name, args, 'V')
    for name, kind in [('a', descriptor('java.util.List')), (switches, descriptor('java.util.Map')), ('d', 'I'), ('e', 'I'), ('f', 'Z')]: field(manager, name, kind)
    field(entry, 'a', descriptor('java.lang.String')); field(entry, entry_data, bundle)
    for name, args, kind in [('a', [descriptor('java.lang.String')], descriptor('java.lang.String')), ('b', [], descriptor('java.util.Set')), ('c', [descriptor('java.lang.String')], 'Z')]: method(gate, name, args, kind, True)
    method(service, incoming, [descriptor('java.lang.String'), bundle], 'V')
    print(json.dumps({'apk': Path(apk).name, 'sha256': hashlib.sha256(Path(apk).read_bytes()).hexdigest(), 'profile': version, 'checks': checks, 'passed': not errors, 'errors': errors}, ensure_ascii=False))
    return not errors

if __name__ == '__main__':
    if len(sys.argv) != 3: raise SystemExit('Usage: python verifyRearSystemProfiles.py <APK> <profile versionCode>')
    raise SystemExit(0 if verify(sys.argv[1], int(sys.argv[2])) else 1)
