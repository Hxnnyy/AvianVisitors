"""Run real HTTP handler inference and record latency/RSS; no accuracy estimate."""

import json
import os
import secrets
import resource
import time
from pathlib import Path
import psutil
from fastapi.testclient import TestClient
from service import app

token = os.environ.setdefault("INFERENCE_TOKEN", secrets.token_urlsafe(32))
client = TestClient(app, headers={"Authorization": "Bearer " + token})
root = Path(__file__).parent
fixtures = root / "tests/fixtures"
inputs = [
    ("robin_cold", fixtures / "robin.jpg", "image", None),
    ("robin_warm", fixtures / "robin.jpg", "image", None),
    (
        "blue_tit",
        fixtures / "tits.jpg",
        "image",
        {"x": 0.04, "y": 0.24, "width": 0.43, "height": 0.45},
    ),
    (
        "great_tit",
        fixtures / "tits.jpg",
        "image",
        {"x": 0.35, "y": 0.55, "width": 0.50, "height": 0.28},
    ),
    ("dog", fixtures / "dog.jpg", "image", None),
]
audio = Path("/fixtures/Pica pica_30s.wav")
if not audio.exists():
    audio = root.parent.parent / "tests/testdata/Pica pica_30s.wav"
inputs.append(("magpie", audio, "audio", None))
for suffix in ("jpeg", "heif"):
    file = root / "models" / ("48mp." + suffix)
    if file.exists():
        inputs.append(("48mp_" + suffix, file, "image", None))
results = []
for name, file, kind, crop in inputs:
    start = time.perf_counter()
    response = client.post(
        "/identify/" + kind,
        files={"file": (file.name, file.read_bytes())},
        data={"crop": json.dumps(crop)} if crop else {},
    )
    result = {
        "name": name,
        "seconds": time.perf_counter() - start,
        "rssMiB": psutil.Process().memory_info().rss / 1048576,
        "peakMiB": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024,
        "cgroupPeakBytes": int(Path("/sys/fs/cgroup/memory.peak").read_text())
        if Path("/sys/fs/cgroup/memory.peak").exists()
        else None,
        "memoryLimitBytes": Path("/sys/fs/cgroup/memory.max").read_text().strip()
        if Path("/sys/fs/cgroup/memory.max").exists()
        else None,
        "cpuLimit": Path("/sys/fs/cgroup/cpu.max").read_text().strip()
        if Path("/sys/fs/cgroup/cpu.max").exists()
        else None,
        "statusCode": response.status_code,
        "result": response.json(),
    }
    print(json.dumps(result), flush=True)
    results.append(result)
Path("benchmark-results.json").write_text(json.dumps(results, indent=2))
