"""Portable, verified journal + original-media snapshots. Inputs must be quiescent."""
from contextlib import closing
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def backup(database, media, destination):
    database, media, destination = map(Path, (database, media, destination))
    if not database.is_file() or not media.is_dir():
        raise ValueError('database file and complete original-media directory are required')
    if destination.exists():
        raise ValueError('snapshot destination must not exist')
    if media.resolve() in destination.resolve().parents:
        raise ValueError('snapshot destination must be outside media directory')
    if any(path.is_symlink() for path in media.rglob('*')):
        raise ValueError('media export must contain real files, not symbolic links')
    destination.mkdir(parents=True)
    with closing(sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True)) as source:
        with closing(sqlite3.connect(destination / 'journal.sqlite')) as target:
            source.backup(target)
    shutil.copytree(media, destination / 'media')
    files = {path.relative_to(destination).as_posix(): digest(path)
             for path in destination.rglob('*') if path.is_file()}
    (destination / 'manifest.json').write_text(json.dumps({'version': 1, 'sha256': files}, indent=2), encoding='utf-8')
    verify(destination)


def verify(snapshot):
    snapshot = Path(snapshot)
    if any(path.is_symlink() for path in snapshot.rglob('*')):
        raise ValueError('snapshot must not contain symbolic links')
    manifest = json.loads((snapshot / 'manifest.json').read_text(encoding='utf-8'))
    if manifest['version'] != 1 or 'journal.sqlite' not in manifest['sha256']:
        raise ValueError('unsupported or incomplete snapshot')
    actual = {path.relative_to(snapshot).as_posix() for path in snapshot.rglob('*')
              if path.is_file() and path != snapshot / 'manifest.json'}
    if actual != set(manifest['sha256']):
        raise ValueError('snapshot file inventory mismatch')
    for name, expected in manifest['sha256'].items():
        path = snapshot / name
        if path.is_symlink() or not path.is_relative_to(snapshot) or digest(path) != expected:
            raise ValueError('snapshot checksum mismatch: ' + name)
    with closing(sqlite3.connect((snapshot / 'journal.sqlite').resolve().as_uri() + '?mode=ro', uri=True)) as database:
        if database.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise ValueError('database integrity check failed')
        for (capture_id,) in database.execute('SELECT id FROM captures'):
            if f'media/originals/{capture_id}' not in actual:
                raise ValueError('original media missing for capture: ' + capture_id)
        if database.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('database foreign key check failed')
    return len(actual)


def restore(snapshot, destination):
    snapshot, destination = map(Path, (snapshot, destination))
    verify(snapshot)
    if destination.exists():
        raise ValueError('restore destination must not exist; restore into an isolated directory')
    shutil.copytree(snapshot, destination)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    create = commands.add_parser('backup')
    create.add_argument('--database', type=Path, required=True)
    create.add_argument('--media', type=Path, required=True)
    create.add_argument('--destination', type=Path, required=True)
    check = commands.add_parser('verify')
    check.add_argument('snapshot', type=Path)
    recover = commands.add_parser('restore')
    recover.add_argument('snapshot', type=Path)
    recover.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'backup':
        backup(args.database, args.media, args.destination)
        print('Snapshot created and verified.')
    elif args.command == 'verify':
        print(f'Verified {verify(args.snapshot)} files including database.')
    else:
        restore(args.snapshot, args.destination)
        print('Restored to isolated destination; production has not been changed.')



