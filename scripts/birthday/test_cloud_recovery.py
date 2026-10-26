from contextlib import closing
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec=importlib.util.spec_from_file_location('cloud_recovery',Path(__file__).with_name('cloud-recovery.py'))
cloud_recovery=importlib.util.module_from_spec(spec)
spec.loader.exec_module(cloud_recovery)

class FixtureCloud:
    account='personal-account'
    def __init__(self,database,bucket,connection,objects):
        self.database,self.bucket,self.connection,self.objects=database,bucket,connection,objects
        self.writes=[]
    def export_sql(self,destination): destination.write_text('\n'.join(self.connection.iterdump()))
    def query(self,sql):
        self.connection.row_factory=sqlite3.Row
        return [dict(row) for row in self.connection.execute(sql)]
    def has_objects(self): return bool(self.objects)
    def get_object(self,key): return self.objects[key]
    def put_object(self,key,source,content_type):
        self.objects[key]=source.read_bytes();self.writes.append((key,content_type))
    def import_sql(self,path): self.connection.executescript(path.read_text())

class CloudRecoveryTest(unittest.TestCase):
    def test_inspected_commands_bind_profile_and_account_without_inherited_work_token(self):
        calls=[]
        def run(args,**kwargs):
            calls.append((args,kwargs))
            return SimpleNamespace(stdout=b'[{"results":[]}]')
        with tempfile.TemporaryDirectory() as directory, patch.object(cloud_recovery.subprocess,'run',side_effect=run), patch.dict(cloud_recovery.os.environ,{'CLOUDFLARE_API_TOKEN':'work-fixture'}):
            client=cloud_recovery.Cloud('personal-account','fresh-db','private-bucket','avian-personal',directory)
            self.assertEqual(client.query('SELECT 1'),[])
            client.get_object('originals/bird')
            client.put_object('originals/bird',Path(directory)/'bird','image/jpeg')
            client.export_sql(Path(directory)/'export.sql')
            client.import_sql(Path(directory)/'export.sql')
        for args,kwargs in calls:
            self.assertEqual(args[-2:],['--profile','avian-personal'])
            self.assertEqual(kwargs['env']['CLOUDFLARE_ACCOUNT_ID'],'personal-account')
            self.assertNotIn('CLOUDFLARE_API_TOKEN',kwargs['env'])
        self.assertIn('originals/bird',calls[1][0])
        self.assertIn('--file',calls[2][0])
        self.assertIn('--dry-run',calls[2][0])
        self.assertIn('--remote',calls[4][0])
        self.assertIn('--remote',calls[5][0])
    def test_export_and_fresh_restore_recover_real_schema_sighting_and_original(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); (root/'staging').mkdir()
            with closing(sqlite3.connect(':memory:')) as source, closing(sqlite3.connect(':memory:')) as target:
                source.executescript((Path(__file__).resolve().parents[2]/'app/migrations/0001_initial.sql').read_text())
                source.execute("INSERT INTO species VALUES('robin','Erithacus rubecula','Robin',NULL)")
                source.execute("INSERT INTO captures(id,kind,status,metadata,created_at,media_type) VALUES('bird','image','review','{}','2026-10-26','image/jpeg')")
                source.execute("INSERT INTO sightings VALUES('sighting','bird','robin','user','2026-10-26','{}','2026-10-26')")
                source.commit()
                original=FixtureCloud('source-db','source-bucket',source,{'originals/bird':b'private-original'})
                cloud_recovery.export_cloud(original,root/'snapshot',root/'staging')
                restored=FixtureCloud('new-db','new-bucket',target,{})
                cloud_recovery.restore_cloud(restored,root/'snapshot')
                self.assertEqual(dict(target.execute('SELECT * FROM sightings').fetchone())['species_id'],'robin')
                self.assertEqual(restored.objects,{'originals/bird':b'private-original'})
                self.assertEqual(restored.writes,[('originals/bird','image/jpeg')])
                with self.assertRaisesRegex(ValueError,'fresh database AND bucket'):
                    cloud_recovery.restore_cloud(original,root/'snapshot')
                restored.writes.clear()
                with self.assertRaisesRegex(ValueError,'no application tables'):
                    cloud_recovery.restore_cloud(restored,root/'snapshot')
                self.assertEqual(restored.writes,[])

if __name__=='__main__': unittest.main()
