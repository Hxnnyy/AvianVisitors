import io
from fastapi.testclient import TestClient
from PIL import Image
import pytest
from service import app


@pytest.fixture(autouse=True)
def local_test_runtime(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.delenv("INFERENCE_TOKEN", raising=False)


client = TestClient(app)


def test_invalid_photo_is_rejected():
    response = client.post(
        "/identify/image", files={"file": ("bad.jpg", b"not an image")}
    )
    assert response.status_code == 415


def test_metadata_keeps_original_dimensions_before_orientation():
    image = Image.new("RGB", (40, 20), "white")
    exif = Image.Exif()
    exif[274] = 6
    exif[36867] = "2020:04:02 13:14:15"
    data = io.BytesIO()
    image.save(data, format="JPEG", exif=exif)
    response = client.post(
        "/identify/image", files={"file": ("photo.jpg", data.getvalue())}
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["raw"]["media"]["width"] == 40
    assert result["raw"]["media"]["height"] == 20
    assert result["metadata"]["capturedAt"] == "2020-04-02T13:14:15"
    assert result["status"] == "no_bird"
    assert result["candidates"] == []


def test_crop_outside_original_is_rejected():
    data = io.BytesIO()
    Image.new("RGB", (40, 40)).save(data, format="PNG")
    result = client.post(
        "/identify/image",
        files={"file": ("x.png", data.getvalue())},
        data={"crop": '{"x":0.9,"y":0,"width":0.2,"height":1}'},
    )
    assert result.status_code == 422


def test_shared_credential_is_enforced(monkeypatch):
    monkeypatch.setenv("INFERENCE_TOKEN", "test-service-secret")
    assert client.get("/health").status_code == 401
    assert (
        client.get(
            "/health", headers={"Authorization": "Bearer test-service-secret"}
        ).status_code
        == 200
    )


def test_real_robin_retains_canonical_name():
    from pathlib import Path

    result = client.post(
        "/identify/image",
        files={
            "file": (
                "robin.jpg",
                (Path(__file__).parent / "fixtures/robin.jpg").read_bytes(),
            )
        },
    ).json()
    assert result["candidates"][0]["scientificName"] == "Erithacus rubecula"
    assert abs(result["candidates"][0]["score"] - 0.8693593) < 1e-5


def test_real_dog_does_not_become_a_bird():
    from pathlib import Path

    result = client.post(
        "/identify/image",
        files={
            "file": (
                "dog.jpg",
                (Path(__file__).parent / "fixtures/dog.jpg").read_bytes(),
            )
        },
    ).json()
    assert result["status"] == "no_bird"
    assert result["candidates"] == []


def test_heic_is_decoded_and_oriented():
    from pillow_heif import from_pillow

    data = io.BytesIO()
    image = Image.new("RGB", (32, 24), "white")
    exif = Image.Exif()
    exif[274] = 6
    exif[36867] = "2020:04:02 13:14:15"
    image.info["exif"] = exif.tobytes()
    from_pillow(image).save(data)
    result = client.post(
        "/identify/image", files={"file": ("phone.heic", data.getvalue())}
    )
    assert result.status_code == 200
    assert result.json()["raw"]["media"]["width"] == 32
    assert result.json()["raw"]["media"]["originalExifOrientation"] == 6
    assert result.json()["raw"]["media"]["orientedWidth"] == 32
    assert result.json()["metadata"]["capturedAt"] == "2020-04-02T13:14:15"


def test_real_audio_repeats_are_one_species_with_three_ranges():
    import json
    from pathlib import Path

    path = (
        Path("/fixtures/Pica pica_30s.wav")
        if Path("/fixtures").exists()
        else Path(__file__).resolve().parents[3] / "tests/testdata/Pica pica_30s.wav"
    )
    response = client.post(
        "/identify/audio",
        files={"file": (path.name, path.read_bytes())},
        data={
            "metadata": json.dumps(
                {
                    "capturedAt": "2024-02-24T16:19:37Z",
                    "location": {"latitude": 53.7, "longitude": -2.3},
                    "source": "user",
                }
            )
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()
    magpie = next(c for c in result["candidates"] if c["scientificName"] == "Pica pica")
    assert len(magpie["ranges"]) == 3
    assert abs(magpie["score"] - 0.9316) < 0.002
    scores = [
        d["score"]
        for d in result["raw"]["detections"]
        if d["scientificName"] == "Pica pica"
    ]
    assert all(abs(a - b) < 0.002 for a, b in zip(scores, [0.9120, 0.9316, 0.8857]))


def test_selected_birds_are_separated_by_crop():
    import json
    from pathlib import Path

    original = (Path(__file__).parent / "fixtures/tits.jpg").read_bytes()
    blue = client.post(
        "/identify/image",
        files={"file": ("tits.jpg", original)},
        data={
            "crop": json.dumps({"x": 0.04, "y": 0.24, "width": 0.43, "height": 0.45})
        },
    ).json()
    great = client.post(
        "/identify/image",
        files={"file": ("tits.jpg", original)},
        data={"crop": json.dumps({"x": 0.35, "y": 0.55, "width": 0.5, "height": 0.28})},
    ).json()
    assert blue["candidates"][0]["scientificName"] == "Cyanistes caeruleus"
    assert abs(blue["candidates"][0]["score"] - 0.8104533) < 1e-5
    assert great["candidates"][0]["scientificName"] == "Parus major"
    assert abs(great["candidates"][0]["score"] - 0.2214355) < 1e-5
    assert great["status"] == "uncertain"


def test_browser_audio_formats_decode_to_real_bird_suggestions():
    import subprocess, tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as temp:
        for name, codec in [("phone.m4a", "aac"), ("browser.webm", "libopus")]:
            target = Path(temp) / name
            source = (
                Path("/fixtures/Pica pica_30s.wav")
                if Path("/fixtures").exists()
                else Path(__file__).resolve().parents[3]
                / "tests/testdata/Pica pica_30s.wav"
            )
            subprocess.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-i",
                    str(source),
                    "-c:a",
                    codec,
                    str(target),
                ],
                check=True,
            )
            response = client.post(
                "/identify/audio", files={"file": (name, target.read_bytes())}
            )
            assert response.status_code == 200, response.text
            assert any(
                c["scientificName"] == "Pica pica"
                for c in response.json()["candidates"]
            )


def test_embedded_date_and_gps_win_over_upload_metadata():
    import json

    image = Image.new("RGB", (32, 24), "white")
    exif = Image.Exif()
    exif[36867] = "2020:04:02 13:14:15"
    exif[36881] = "+01:00"
    exif[34853] = {1: "N", 2: (53.0, 42.0, 0.0), 3: "W", 4: (2.0, 18.0, 0.0)}
    data = io.BytesIO()
    image.save(data, format="JPEG", exif=exif)
    result = client.post(
        "/identify/image",
        files={"file": ("old.jpg", data.getvalue())},
        data={
            "metadata": json.dumps(
                {
                    "capturedAt": "2026-10-26T12:00:00Z",
                    "location": {"latitude": 1, "longitude": 1},
                    "source": "user",
                }
            )
        },
    ).json()
    assert result["metadata"]["capturedAt"] == "2020-04-02T13:14:15+01:00"
    assert result["metadata"]["location"] == {"latitude": 53.7, "longitude": -2.3}
    assert result["metadata"]["source"] == "embedded"


def test_upload_limit_rejects_before_decode():
    response = client.post(
        "/identify/image", files={"file": ("large.jpg", b"x" * (25 * 1024 * 1024 + 1))}
    )
    assert response.status_code == 413
    assert response.json()["error"] == "upload_too_large"


def test_remote_peer_requires_configured_service_credential(monkeypatch):
    monkeypatch.delenv("INFERENCE_TOKEN", raising=False)
    remote = TestClient(app, client=("203.0.113.1", 12345))
    assert remote.get("/health").status_code == 503
    monkeypatch.setenv("ENVIRONMENT", "production")
    loopback = TestClient(app, client=("127.0.0.1", 12345))
    assert loopback.get("/health").status_code == 503
