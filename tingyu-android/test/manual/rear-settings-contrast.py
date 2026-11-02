"""Check computed text paint against pixels in the matching Playwright Web screenshot.
Usage: python test/manual/rear-settings-contrast.py <TINGYU_QA_DIR>
Requires Pillow. This is Web evidence, not an Android Canvas measurement.
"""
import json
import re
import sys
from pathlib import Path
from PIL import Image


def luminance(rgb):
    channels = [v / 255 for v in rgb]
    linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in channels]
    return sum(a * b for a, b in zip(linear, [.2126, .7152, .0722]))


base = Path(sys.argv[1])
results = []
for data in base.glob('*.colors.json'):
    image = Image.open(data.with_name(data.name.replace('.colors.json', '.png'))).convert('RGB')
    rows = []
    for row in json.loads(data.read_text(encoding='utf8')):
        x, y = round(row['x']), round(row['y'])
        if not (0 <= x < image.width and 0 <= y < image.height):
            continue
        background = image.getpixel((x, y))
        rgba = [float(v) for v in re.findall(r'[\d.]+', row['color'])]
        alpha = row['opacity'] * (rgba[3] if len(rgba) > 3 else 1)
        foreground = [c * alpha + b * (1 - alpha) for c, b in zip(rgba[:3], background)]
        low, high = sorted([luminance(background), luminance(foreground)])
        rows.append(dict(text=row['text'], ratio=round((high + .05) / (low + .05), 2),
                         opacity=row['opacity'], fontSize=row['fontSize'], color=row['color'], background=background))
    results.append(dict(preview=data.stem, minContrast=min([r['ratio'] for r in rows], default=99), rows=rows))
(base / 'contrast-report.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf8')
for result in results:
    print(result['preview'], result['minContrast'])
assert results, 'No screenshot color samples found'
assert all(r['minContrast'] >= 4.5 for r in results), 'Readable text contrast below 4.5:1'
