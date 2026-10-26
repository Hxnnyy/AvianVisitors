import os
import secrets
import io, json, time
from pathlib import Path
from PIL import Image, ImageEnhance
from fastapi.testclient import TestClient
from service import app

token = os.environ.setdefault("INFERENCE_TOKEN", secrets.token_urlsafe(32))
client = TestClient(app, headers={"Authorization": "Bearer " + token})
results = []
robin = Image.open("tests/fixtures/robin.jpg").convert("RGB")
small = Image.new("RGB", (1500, 1200), (70, 90, 50))
small.paste(robin.resize((112, 94)), (700, 550))
for name, image in [
    ("herring-gull", Image.open("tests/fixtures/herring-gull.jpg")),
    ("dark-robin", ImageEnhance.Brightness(robin).enhance(0.15)),
    ("small-robin", small),
]:
    data = io.BytesIO()
    image.save(data, format="JPEG")
    start = time.perf_counter()
    response = client.post(
        "/identify/image", files={"file": (name + ".jpg", data.getvalue())}
    )
    result = {
        "name": name,
        "seconds": time.perf_counter() - start,
        "statusCode": response.status_code,
        "result": response.json(),
    }
    results.append(result)
    print(json.dumps(result), flush=True)
Path("quality-results.json").write_text(json.dumps(results, indent=2))
