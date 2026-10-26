"""Cloud recovery via explicit personal cf/Wrangler profile. Default: command plan only."""
import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import re
from recovery import backup, verify, digest

ROOT = Path(__file__).resolve().parents[2]

class Cloud:
    def __init__(self, account, database, bucket, profile, staging):
        self.account, self.database, self.bucket, self.profile = account, database, bucket, profile
        self.staging = Path(staging)
        self.env = {key: value for key, value in os.environ.items() if key not in ('CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_KEY','CLOUDFLARE_EMAIL','CLOUDFLARE_ACCOUNT_ID','CF_API_TOKEN','CF_API_KEY','CF_EMAIL','CF_ACCOUNT_ID')}
        self.env['CLOUDFLARE_ACCOUNT_ID'] = account
        executable = shutil.which('cf')
        if not executable:
            raise ValueError('cf CLI is required')
        self.cf = [shutil.which('node'), str(Path(executable).parent / 'node_modules/cf/bin/cf')] if os.name == 'nt' else [executable]
        self.wrangler = [shutil.which('node'), str(ROOT / 'app/node_modules/wrangler/bin/wrangler.js')]
        self.config = self.staging / 'wrangler-recovery.json'
        self.config.write_text(json.dumps({'name':'avian-recovery','d1_databases':[{'binding':'DB','database_name':'avian-recovery','database_id':database}]}))

    def run(self, args):
        result = subprocess.run(args, env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return result.stdout

    def command(self, args):
        return self.cf + args + ['--profile', self.profile]

    def query(self, sql):
        output = json.loads(self.run(self.command(['d1','query',self.database,'--sql',sql])))
        if isinstance(output, dict) and 'result' in output:
            if output.get('success') is False:
                raise ValueError('D1 query failed')
            output = output['result']
        if not isinstance(output, list) or len(output) != 1 or not isinstance(output[0].get('results'), list):
            raise ValueError('Unrecognised cf D1 query response; validate CLI compatibility before recovery')
        return output[0]['results']

    def export_sql(self, destination):
        self.run(self.wrangler + ['d1','export','DB','--remote','--output',str(destination),'--config',str(self.config),'--profile',self.profile])

    def import_sql(self, source):
        self.run(self.wrangler + ['d1','execute','DB','--remote','--file',str(source),'--yes','--config',str(self.config),'--profile',self.profile])

    def get_object(self, key):
        return self.run(self.command(['r2','objects','get',key,'--bucket-name',self.bucket]))

    def put_object(self, key, source, content_type):
        self.run(self.command(['r2','objects','put',key,'--bucket-name',self.bucket,'--file',str(source),'--content-type',content_type,'--dry-run']))
        self.run(self.command(['r2','objects','put',key,'--bucket-name',self.bucket,'--file',str(source),'--content-type',content_type]))

    def has_objects(self):
        output = json.loads(self.run(self.command(['r2','objects','list','--bucket-name',self.bucket,'--per-page','1'])))
        if isinstance(output, dict) and 'result' in output:
            output = output['result']
        if not isinstance(output, dict) or not isinstance(output.get('objects'), list):
            raise ValueError('Unrecognised cf R2 list response; validate CLI compatibility before recovery')
        return bool(output['objects'])


def inventory(database):
    with closing(sqlite3.connect(database)) as connection:
        objects = [{'key':f'originals/{capture_id}','contentType':media_type} for capture_id, media_type in connection.execute('SELECT id,media_type FROM captures')]
        for (revision,) in connection.execute('SELECT revision FROM frame WHERE revision IS NOT NULL'):
            objects.append({'key':f'frames/{revision}.png','contentType':'image/png'})
    for item in objects:
        if not re.fullmatch(r'(originals/[a-zA-Z0-9-]+|frames/[a-zA-Z0-9-]+\.png)', item['key']):
            raise ValueError('Unsafe object key in database')
    return objects


def export_cloud(cloud, destination, staging):
    sql = staging / 'export.sql'
    cloud.export_sql(sql)
    database = staging / 'journal.sqlite'
    with closing(sqlite3.connect(database)) as connection:
        connection.executescript(sql.read_text(encoding='utf-8'))
        connection.commit()
    media = staging / 'media'
    media.mkdir()
    objects = inventory(database)
    for item in objects:
        target = media / item['key']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(cloud.get_object(item['key']))
    backup(database, media, destination)
    shutil.copyfile(sql, destination / 'export.sql')
    (destination / 'source.json').write_text(json.dumps({'account':cloud.account,'database':cloud.database,'bucket':cloud.bucket,'objects':objects},indent=2))
    files = {path.relative_to(destination).as_posix():digest(path) for path in destination.rglob('*') if path.is_file() and path.name != 'manifest.json'}
    (destination / 'manifest.json').write_text(json.dumps({'version':1,'sha256':files},indent=2))
    verify(destination)


def restore_cloud(cloud, snapshot):
    verify(snapshot)
    source = json.loads((snapshot / 'source.json').read_text())
    if cloud.database == source['database'] or cloud.bucket == source['bucket']:
        raise ValueError('Restore requires a different fresh database AND bucket')
    tables = cloud.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")
    if tables or cloud.has_objects():
        raise ValueError('Restore target must contain no application tables or objects')
    expected = inventory(snapshot / 'journal.sqlite')
    if expected != source['objects']:
        raise ValueError('Object inventory differs from database')
    for item in expected:
        local = snapshot / 'media' / item['key']
        cloud.put_object(item['key'], local, item['contentType'])
        if cloud.get_object(item['key']) != local.read_bytes():
            raise ValueError('Restored object differs: ' + item['key'])
    cloud.import_sql(snapshot / 'export.sql')
    restored = cloud.query('SELECT id,media_type FROM captures ORDER BY id')
    with closing(sqlite3.connect(snapshot / 'journal.sqlite')) as connection:
        expected_rows = [{'id':row[0],'media_type':row[1]} for row in connection.execute('SELECT id,media_type FROM captures ORDER BY id')]
    if restored != expected_rows:
        raise ValueError('Restored capture inventory differs; do not switch bindings')
    for table in ['species','captures','sightings','frame']:
        sql=f'SELECT COUNT(*) AS count FROM {table}'
        with closing(sqlite3.connect(snapshot / 'journal.sqlite')) as connection:
            count=connection.execute(sql).fetchone()[0]
        if cloud.query(sql) != [{'count':count}]:
            raise ValueError('Restored row count differs for '+table+'; do not switch bindings')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation',choices=['backup','restore'])
    parser.add_argument('--account-id',required=True)
    parser.add_argument('--database-id',required=True)
    parser.add_argument('--bucket',required=True)
    parser.add_argument('--profile',required=True)
    parser.add_argument('--snapshot',type=Path,required=True)
    parser.add_argument('--execute',action='store_true')
    parser.add_argument('--writes-stopped',action='store_true')
    args=parser.parse_args()
    if not args.execute:
        print(json.dumps({'operation':args.operation,'account':args.account_id,'database':args.database_id,'bucket':args.bucket,'profile':args.profile,'snapshot':str(args.snapshot),'willExecute':False,'commands':['wrangler d1 export DB --remote / wrangler d1 execute DB --remote --file export.sql','cf r2 objects get/put <referenced-key> --bucket-name <bucket>','cf d1 query <database> --sql <freshness/inventory query>']}))
        return
    if not args.writes_stopped:
        parser.error('--writes-stopped is required: quiesce application mutations first')
    destination=args.snapshot.resolve()
    if args.operation=='backup' and destination.exists():
        parser.error('backup snapshot destination must not exist')
    with tempfile.TemporaryDirectory(prefix='avian-recovery-') as directory:
        staging=Path(directory)
        cloud=Cloud(args.account_id,args.database_id,args.bucket,args.profile,staging)
        if args.operation=='backup': export_cloud(cloud,destination,staging)
        else: restore_cloud(cloud,destination)
    print('Recovery operation verified. No Worker bindings were changed.')

if __name__=='__main__': main()
