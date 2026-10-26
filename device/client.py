"""Restricted display-only client. No model, browser, or capture credentials."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import urllib.parse
import urllib.request
from PIL import Image
if os.name == 'nt':
    import msvcrt
else:
    import fcntl

MAX_IMAGE_BYTES = 8 * 1024 * 1024

def validate_image(data):
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError('Frame image exceeds 8 MiB')
    image = Image.open(io.BytesIO(data))
    if image.format != 'PNG' or image.size != (480, 800):
        raise ValueError('Expected a 480×800 PNG')
    image.load()
    return image.convert('RGB')

def push_panel(image, rotation):
    from inky.auto import auto
    panel = auto()
    if (panel.width, panel.height) != (800, 480):
        raise ValueError(f'Expected auto-detected 7.3-inch 800×480 panel, found {panel.width}×{panel.height}')
    buffer = image.rotate(rotation, expand=True)
    if buffer.size != (panel.width, panel.height):
        raise ValueError('Portrait rotation does not match detected panel')
    panel.set_image(buffer)
    panel.show()

def atomic_write(path, data):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
        temporary.write(data)
        temporary.flush()
        os.fsync(temporary.fileno())
        name = temporary.name
    os.replace(name, path)

class Client:
    def __init__(self, url, token, cache, request=None, push=push_panel):
        if urllib.parse.urlsplit(url).scheme != 'https' and not url.startswith('http://127.0.0.1:'):
            raise ValueError('Device URL must use HTTPS (localhost permitted for tests)')
        self.url, self.token, self.cache = url.rstrip('/'), token, Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.request, self.push = request or self.http, push

    def http(self, path, body=None):
        url = urllib.parse.urljoin(self.url + '/', path)
        target, origin = urllib.parse.urlsplit(url), urllib.parse.urlsplit(self.url)
        if (target.scheme, target.netloc) != (origin.scheme, origin.netloc):
            raise ValueError('Refusing image URL outside configured device origin')
        request = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
            headers={'Authorization': f'Bearer {self.token}', 'Content-Type': 'application/json'})
        # Redirects must not forward the device credential to another host.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                raise ValueError('Device endpoints must not redirect')
        with urllib.request.build_opener(NoRedirect).open(request, timeout=45) as response:
            data = response.read(MAX_IMAGE_BYTES + 1)
            if len(data) > MAX_IMAGE_BYTES:
                raise ValueError('Response exceeds 8 MiB')
            return data

    def run(self, rotation=90, dry_run=False, preview=None):
        if rotation not in (90, 270):
            raise ValueError('Rotation must be 90 or 270')
        with (self.cache / 'refresh.lock').open('a') as lock:
            try:
                if os.name == 'nt':
                    lock.write('0')
                    lock.flush()
                    lock.seek(0)
                    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except (BlockingIOError, PermissionError):
                return 'busy'
            manifest = json.loads(self.request('/device/manifest'))
            revision, url = manifest.get('revision'), manifest.get('imageUrl')
            if (manifest.get('width'), manifest.get('height')) != (480, 800):
                raise ValueError('Invalid manifest dimensions')
            if revision is None and url is None:
                return 'empty'
            if not isinstance(revision, str) or not revision or not isinstance(url, str):
                raise ValueError('Invalid frame manifest')
            state_path = self.cache / 'state.json'
            state = json.loads(state_path.read_text()) if state_path.exists() else {}
            if state.get('revision') == revision and not dry_run and preview is None:
                # A failed acknowledgement is retried without refreshing the panel.
                self.request('/device/ack', {'revision': revision})
                return 'unchanged'
            data = self.request(url)
            image = validate_image(data)
            if preview is not None:
                image.save(preview, 'PNG')
            if dry_run or preview is not None:
                return 'validated'
            self.push(image, rotation)
            # Publish local last-good only after the physical driver returns success.
            atomic_write(self.cache / 'last-good.png', data)
            atomic_write(state_path, json.dumps({'revision':revision,'sha256':hashlib.sha256(data).hexdigest()}).encode())
            self.request('/device/ack', {'revision':revision})
            return 'displayed'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='/etc/avian-frame/config.json')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--preview', type=Path)
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    client = Client(config['url'], config['token'], config.get('cache','/var/lib/avian-frame'))
    print(client.run(config.get('rotation',90), args.dry_run, args.preview))

if __name__ == '__main__':
    main()
