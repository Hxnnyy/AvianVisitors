"""Rebuild the bounded UK catalogue and copy unchanged, licensed upstream art."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'artwork'
UPSTREAM = '5950f807b29157fde671ce302788d3f676d4ccca'
REJECTED = {'anas-crecca': 'Upstream male depicts North American vertical white breast bar rather than Eurasian horizontal shoulder stripe.', 'mareca-strepera': 'Head and plumage ambiguous in contact-sheet review; retain missing state.', 'riparia-riparia': 'Diagnostic dark breast band not clear; retain missing state.'}


def build():
    birdnet = json.loads((ROOT / 'model/l18n/labels_en.json').read_text(encoding='utf-8'))
    labels = json.loads((HERE / 'photo-labels.json').read_text(encoding='utf-8'))
    generated = json.loads((HERE / 'generated.json').read_text(encoding='utf-8'))
    species, assets = [], []
    for line in (HERE / 'uk-species.txt').read_text(encoding='utf-8').splitlines():
        if not line or line.startswith('#'):
            continue
        scientific, common, alternatives = line.split('|')
        slug = scientific.lower().replace(' ', '-')
        aliases = list(dict.fromkeys([scientific, common] + [a for a in alternatives.split(';') if a] + ([birdnet[scientific]] if scientific in birdnet else [])))
        source = ROOT / f'avian/assets/illustrations/{slug}.png'
        target = ROOT / f'app/public/birds/{slug}.png'
        available = source.exists() and slug not in REJECTED
        if available:
            target.write_bytes(source.read_bytes())
            assets.append({'speciesId': slug, 'path': f'/birds/{slug}.png', 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'source': f'https://github.com/Twarner491/AvianVisitors/blob/{UPSTREAM}/avian/assets/illustrations/{slug}.png', 'license': 'CC-BY-NC-SA-4.0', 'creator': 'AvianVisitors contributors (Twarner491)', 'modifications': 'None; byte-for-byte copy', 'review': 'reviewed', 'reviewScope': 'Contact sheet visual review: species features, whole bird, style. Not expert ornithological certification.'})
        elif slug in generated:
            available = True
            assets.append({'speciesId': slug, 'path': f'/birds/{slug}.png', 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), **generated[slug]})
        photo_labels = [label for label in labels if label.lower().replace('’', "'") in [a.lower() for a in aliases]]
        species.append({'id': slug, 'scientificName': scientific, 'commonName': common, 'aliases': aliases, 'birdnetLabels': [name for name in aliases if name in birdnet], 'photoLabels': photo_labels, 'artworkUrl': f'/birds/{slug}.png' if available else None, 'artworkStatus': 'reviewed' if available else 'missing'})
    (HERE / 'species.json').write_text(json.dumps(species, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    (HERE / 'assets.json').write_text(json.dumps(assets, indent=2) + '\n', encoding='utf-8')
    mapping = {label: s['scientificName'] for s in species for label in s['photoLabels']}
    (HERE / 'photo-taxonomy.json').write_text(json.dumps(mapping, indent=2) + '\n', encoding='utf-8')
    print(f'{len(species)} species; {len(assets)} reviewed assets; {len(species)-len(assets)} missing artwork; {len(mapping)}/707 photo labels')


if __name__ == '__main__':
    build()
