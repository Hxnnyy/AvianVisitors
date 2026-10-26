import hashlib
import json
import unittest
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


class CatalogueTests(unittest.TestCase):
    def setUp(self):
        self.species = json.loads((ROOT / 'artwork/species.json').read_text(encoding='utf-8'))
        self.assets = json.loads((ROOT / 'artwork/assets.json').read_text())

    def test_familiar_uk_birds_are_searchable_without_taxonomic_substitution(self):
        by_id = {s['id']: s for s in self.species}
        self.assertEqual(len(by_id), len(self.species))
        self.assertEqual(by_id['erithacus-rubecula']['commonName'], 'Robin')
        self.assertIn('European Robin', by_id['erithacus-rubecula']['aliases'])
        self.assertNotIn('American Robin', by_id['erithacus-rubecula']['aliases'])
        self.assertIn('Parus caeruleus', by_id['cyanistes-caeruleus']['aliases'])
        self.assertIn('Corvus monedula', by_id['coloeus-monedula']['aliases'])
        for species_id in ['erithacus-rubecula', 'cyanistes-caeruleus', 'parus-major', 'turdus-merula', 'troglodytes-troglodytes', 'fringilla-coelebs', 'haematopus-ostralegus', 'pica-pica', 'prunella-modularis', 'aegithalos-caudatus', 'carduelis-carduelis', 'columba-palumbus', 'sitta-europaea', 'ardea-cinerea']:
            self.assertEqual(by_id[species_id]['artworkStatus'], 'reviewed')

    def test_reviewed_artwork_matches_files_and_has_usable_alpha(self):
        for asset in self.assets:
            path = ROOT / ('app/public' + asset['path'])
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), asset['sha256'])
            self.assertEqual(asset['review'], 'reviewed')
            with Image.open(path) as image:
                self.assertEqual(image.mode, 'RGBA')
                alpha = image.getchannel('A')
                self.assertEqual(alpha.getextrema()[0], 0)
                self.assertGreaterEqual(alpha.getextrema()[1], 254)
                self.assertGreater(min(image.size), 100)

    def test_each_available_artwork_has_provenance_and_missing_is_explicit(self):
        paths = {a['path'] for a in self.assets}
        self.assertEqual(paths, {'/birds/' + p.name for p in (ROOT / 'app/public/birds').glob('*.png')})
        for species in self.species:
            if species['artworkUrl'] is None:
                self.assertEqual(species['artworkStatus'], 'missing')
            else:
                self.assertIn(species['artworkUrl'], paths)
                self.assertEqual(species['artworkStatus'], 'reviewed')

    def test_real_classifier_labels_map_exactly_once(self):
        labels = json.loads((ROOT / 'artwork/photo-labels.json').read_text())
        mapping = json.loads((ROOT / 'artwork/photo-taxonomy.json').read_text())
        self.assertGreater(len(mapping), 150)
        emitted_labels = [label for species in self.species for label in species['photoLabels']]
        self.assertEqual(len(emitted_labels), len(set(emitted_labels)))
        self.assertEqual(len({scientific for scientific in mapping.values()}), len(self.species))
        for label, scientific in mapping.items():
            self.assertIn(label, labels)
            self.assertIn(scientific, {s['scientificName'] for s in self.species})
        self.assertEqual(mapping['European robin'], 'Erithacus rubecula')
        self.assertEqual(mapping['Eurasian blue tit'], 'Cyanistes caeruleus')


if __name__ == '__main__':
    unittest.main()
