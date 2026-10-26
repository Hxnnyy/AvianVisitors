"""Admit one visually reviewed generated cutout; never generates images at runtime."""
import argparse
import json
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('species_id')
    parser.add_argument('source', type=Path)
    parser.add_argument('--review', required=True, help='Observed species features and style review')
    args = parser.parse_args()
    species = json.loads((HERE / 'species.json').read_text(encoding='utf-8'))
    if args.species_id not in {s['id'] for s in species}:
        parser.error('Unknown canonical species id')
    with Image.open(args.source) as image:
        if image.mode != 'RGBA' or image.getchannel('A').getextrema()[0] != 0 or image.getchannel('A').getextrema()[1] < 254:
            parser.error('Expected transparent RGBA cutout')
    target = ROOT / f'app/public/birds/{args.species_id}.png'
    if target.exists():
        parser.error('Refusing to overwrite an existing asset')
    target.write_bytes(args.source.read_bytes())
    manifest = json.loads((HERE / 'generated.json').read_text())
    manifest[args.species_id] = {
        'source': str(args.source),
        'generator': 'OpenAI built-in imagegen, 2026-10-26',
        'license': 'CC-BY-NC-SA-4.0 (derived style-reference artwork)',
        'creator': 'Generated for the birthday bird journal using OpenAI imagegen',
        'styleReference': f'https://github.com/Twarner491/AvianVisitors/blob/5950f807b29157fde671ce302788d3f676d4ccca/avian/assets/illustrations/passer-domesticus.png',
        'promptRecipe': 'Sparse Japanese kacho-e woodblock, muted flat colour zones, minimal texture, fine ink contours; explicit target species diagnostic anatomy; one whole bird facing left, neutral perched/standing posture; no perch, text, scenery or shadow; transparent background.',
        'modifications': 'None; original generated transparent PNG copied byte-for-byte',
        'review': 'reviewed',
        'reviewScope': args.review,
    }
    (HERE / 'generated.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
