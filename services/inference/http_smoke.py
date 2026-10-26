"""Exercise actual local HTTP/auth/model boundaries against a running container."""

import json
import os
import time
from pathlib import Path
from urllib.parse import urlsplit
import httpx

root = Path(__file__).parent
base = os.environ.get("INFERENCE_BASE_URL", "http://127.0.0.1:18081")
if urlsplit(base).hostname not in ("127.0.0.1", "localhost", "::1"):
    raise RuntimeError("This smoke check is for a local service only")
token = os.environ["INFERENCE_TOKEN"]
results = {}
with httpx.Client(
    base_url=base, headers={"Authorization": "Bearer " + token}, timeout=120
) as client:
    for attempt in range(30):
        try:
            health = client.get("/health", timeout=1)
            if health.status_code == 200:
                break
        except httpx.TransportError:
            time.sleep(1)
    else:
        raise RuntimeError("Service did not become ready")
    unauthenticated = httpx.get(base + "/health", timeout=5)
    assert unauthenticated.status_code == 401
    results["health"] = {
        "authenticated": health.status_code,
        "unauthenticated": unauthenticated.status_code,
    }
    for name, file, kind in [
        ("photo_cold", root / "tests/fixtures/robin.jpg", "image"),
        ("photo_warm", root / "tests/fixtures/robin.jpg", "image"),
        ("audio", root.parent.parent / "tests/testdata/Pica pica_30s.wav", "audio"),
        ("48mp_jpeg", root / "models/48mp.jpeg", "image"),
        ("48mp_heif", root / "models/48mp.heif", "image"),
    ]:
        start = time.perf_counter()
        response = client.post(
            "/identify/" + kind, files={"file": (file.name, file.read_bytes())}
        )
        response.raise_for_status()
        value = response.json()
        expected = "Pica pica" if kind == "audio" else "Erithacus rubecula"
        assert value["candidates"][0]["scientificName"] == expected
        result = {
            "seconds": time.perf_counter() - start,
            "statusCode": response.status_code,
            "candidate": value["candidates"][0],
            "media": value.get("raw", {}).get("media"),
        }
        results[name] = result
        print(name, json.dumps(result), flush=True)
(root / "http-proof-results.json").write_text(json.dumps(results, indent=2))
