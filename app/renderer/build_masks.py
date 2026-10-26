"""Regenerate deterministic renderer masks after approved artwork changes.
Derived silhouettes are layout metadata, not replacement illustrations.
Run from repository root: python app/renderer/build_masks.py
"""
import json
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parents[1]
result={}
for path in sorted((root/'public'/'birds').glob('*.png')):
    with Image.open(path) as image:
        width,height=image.size
        alpha=image.convert('RGBA').getchannel('A')
        mask=alpha.resize((40,40),Image.Resampling.BOX)
        cells=[[x,y] for y in range(40) for x in range(40) if mask.getpixel((x,y))>40]
        if not cells:
            raise ValueError(f'Artwork has no opaque silhouette: {path}')
        result[path.stem]={'width':width,'height':height,'w':40,'h':40,'cells':cells}
(root/'renderer'/'masks.json').write_text(json.dumps(result,separators=(',',':')),encoding='utf-8')
print(f'Built {len(result)} artwork silhouettes')
