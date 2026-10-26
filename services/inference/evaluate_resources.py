import os
import secrets
import gc, io, json, time, psutil
from PIL import Image
from pillow_heif import from_pillow
from fastapi.testclient import TestClient
from service import app
from pathlib import Path

p = psutil.Process()
token = os.environ.setdefault("INFERENCE_TOKEN", secrets.token_urlsafe(32))
client = TestClient(app, headers={"Authorization": "Bearer " + token})
outputs = []
for format in ("JPEG", "HEIF"):
    fixture = Path("models") / ("48mp." + format.lower())
    if not fixture.exists():
        image = Image.open(Path("tests/fixtures/robin.jpg")).resize((8000, 6000))
        data = io.BytesIO()
        if format == "HEIF":
            from_pillow(image).save(data, quality=60)
        else:
            image.save(data, format="JPEG", quality=85)
        fixture.write_bytes(data.getvalue())
        del image
        gc.collect()
    data = io.BytesIO(fixture.read_bytes())
    started = time.perf_counter()
    result = client.post(
        "/identify/image", files={"file": ("48mp." + format.lower(), data.getvalue())}
    )
    outputs.append(
        {
            "format": format,
            "bytes": len(data.getvalue()),
            "seconds": time.perf_counter() - started,
            "statusCode": result.status_code,
            "rssMiB": p.memory_info().rss / 1048576,
            "peakMiB": getattr(p.memory_info(), "peak_wset", 0) / 1048576,
            "raw": result.json().get("raw"),
        }
    )
    print(json.dumps(outputs[-1]), flush=True)
Path("resource-results.json").write_text(json.dumps(outputs, indent=2))
