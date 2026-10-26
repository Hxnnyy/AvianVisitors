from contextlib import closing
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

class RecoveryTest(unittest.TestCase):
    def test_database_and_originals_round_trip_and_corruption_rejected(self):
        spec = importlib.util.spec_from_file_location('recovery', Path(__file__).with_name('recovery.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            db = root / 'journal.sqlite'
            with closing(sqlite3.connect(db)) as connection:
                connection.execute('create table captures (id text primary key)')
                connection.execute("insert into captures values ('bird')")
                connection.execute('create table sightings (species text)')
                connection.execute("insert into sightings values ('Magpie')")
                connection.commit()
            media = root / 'originals'
            (media / 'originals').mkdir(parents=True)
            (media / 'originals' / 'bird').write_bytes(b'original-photo')
            module.backup(db, media, root / 'snapshot')
            module.restore(root / 'snapshot', root / 'restored')
            with closing(sqlite3.connect(root / 'restored' / 'journal.sqlite')) as connection:
                self.assertEqual(connection.execute('select species from sightings').fetchone(), ('Magpie',))
            self.assertEqual((root / 'restored' / 'media' / 'originals' / 'bird').read_bytes(), b'original-photo')
            (root / 'snapshot' / 'media' / 'originals' / 'bird').write_bytes(b'broken')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                module.restore(root / 'snapshot', root / 'rejected')
            self.assertFalse((root / 'rejected').exists())

    def test_missing_original_prevents_accepting_snapshot(self):
        spec = importlib.util.spec_from_file_location('recovery', Path(__file__).with_name('recovery.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with closing(sqlite3.connect(root / 'journal.sqlite')) as connection:
                connection.execute('create table captures (id text primary key)')
                connection.execute("insert into captures values ('missing')")
                connection.commit()
            (root / 'media').mkdir()
            with self.assertRaisesRegex(ValueError, 'original media missing'):
                module.backup(root / 'journal.sqlite', root / 'media', root / 'snapshot')

if __name__ == '__main__':
    unittest.main()


