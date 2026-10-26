import io
import hashlib
import json
import math
import os
import re
import secrets
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
from functools import lru_cache, wraps
from threading import RLock

MODEL_LOCK = RLock()


def serialized(fn):
    @wraps(fn)
    def run(*args, **kwargs):
        with MODEL_LOCK:
            return fn(*args, **kwargs)

    return run


import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

register_heif_opener(decode_threads=1)
Image.MAX_IMAGE_PIXELS = 60_000_000
ROOT = Path(__file__).parent
MODEL_ROOT = Path(os.environ.get("BIRDNET_MODELS", ROOT.parent.parent / "model"))
app = FastAPI()


@app.exception_handler(HTTPException)
async def service_error(request, error):
    from fastapi.responses import JSONResponse

    return JSONResponse({"error": error.detail}, status_code=error.status_code)


@app.exception_handler(RequestValidationError)
async def invalid_request(request, error):
    from fastapi.responses import JSONResponse

    return JSONResponse({"error": "invalid_request"}, status_code=422)


def verify_model(path):
    expected = json.loads((ROOT / "model-checksums.json").read_text())[path.name]
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise RuntimeError("Model checksum mismatch: " + path.name)


@app.middleware("http")
async def authentication(request: Request, call_next):
    from fastapi.responses import JSONResponse

    token = os.environ.get("INFERENCE_TOKEN")
    if token:
        if not secrets.compare_digest(
            request.headers.get("authorization", "").encode(),
            ("Bearer " + token).encode(),
        ):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
    elif os.environ.get("ENVIRONMENT") == "production" or request.client.host not in (
        "127.0.0.1",
        "::1",
        "localhost",
        "testclient",
    ):
        return JSONResponse({"error": "service_token_required"}, status_code=503)
    length = request.headers.get("content-length")
    if length and not length.isdigit():
        return JSONResponse({"error": "invalid_content_length"}, status_code=400)
    if length and int(length) > 26 * 1024 * 1024:
        return JSONResponse({"error": "upload_too_large"}, status_code=413)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 26 * 1024 * 1024:
            return JSONResponse({"error": "upload_too_large"}, status_code=413)
    request._body = bytes(body)
    return await call_next(request)


@app.get("/health")
def health():
    return {"status": "ok", "device": "cpu"}


def parse_json(value, name):
    try:
        result = json.loads(value) if value else None
    except json.JSONDecodeError:
        raise HTTPException(422, f"invalid_{name}")
    if result is not None and not isinstance(result, dict):
        raise HTTPException(422, f"invalid_{name}")
    return result


def read_upload(file):
    data = file.file.read(25 * 1024 * 1024 + 1)
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "upload_too_large")
    return data


def photo(data, crop):
    try:
        image = Image.open(io.BytesIO(data))
        if image.width * image.height > 60_000_000:
            raise HTTPException(413, "image_too_large")
        original_size = image.size
        if crop is None:
            image.draft("RGB", (2048, 2048))
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(415, "unsupported_or_invalid_image")
    exif = image.getexif()
    media = {
        "width": original_size[0],
        "height": original_size[1],
        "orientation": exif.get(274, 1),
        "originalExifOrientation": image.info.get("original_orientation")
        or exif.get(274),
    }
    captured = None
    stamp = exif.get(36867) or exif.get_ifd(34665).get(36867)
    warnings = []
    if stamp:
        try:
            captured = datetime.strptime(stamp, "%Y:%m:%d %H:%M:%S").isoformat()
        except (ValueError, TypeError):
            warnings.append("invalid_embedded_date")
        if captured:
            offset = exif.get(36881) or exif.get_ifd(34665).get(36881)
            if isinstance(offset, str) and re.fullmatch(
                r"[+-][0-9]{2}:[0-9]{2}", offset
            ):
                try:
                    captured = datetime.fromisoformat(captured + offset).isoformat()
                except ValueError:
                    warnings.extend(
                        ["invalid_embedded_timezone", "embedded_date_has_no_timezone"]
                    )
            else:
                warnings.append("embedded_date_has_no_timezone")
    gps = exif.get_ifd(34853)
    location = None
    if all(key in gps for key in (1, 2, 3, 4)):

        def degrees(parts):
            return float(parts[0]) + float(parts[1]) / 60 + float(parts[2]) / 3600

        try:
            lat = degrees(gps[2]) * (-1 if gps[1] == "S" else 1)
            lon = degrees(gps[4]) * (-1 if gps[3] == "W" else 1)
            if (
                gps[1] not in ("N", "S")
                or gps[3] not in ("E", "W")
                or not -90 <= lat <= 90
                or not -180 <= lon <= 180
            ):
                raise ValueError("GPS coordinates outside bounds")
            location = {"latitude": lat, "longitude": lon}
        except (TypeError, ValueError, ZeroDivisionError, IndexError):
            warnings.append("invalid_embedded_gps")
    image = ImageOps.exif_transpose(image).convert("RGB")
    media["orientedWidth"], media["orientedHeight"] = (
        original_size[::-1] if media["orientation"] in (5, 6, 7, 8) else original_size
    )
    if crop is not None:
        if set(crop) != {"x", "y", "width", "height"} or any(
            not isinstance(v, (float, int))
            or isinstance(v, bool)
            or not math.isfinite(v)
            for v in crop.values()
        ):
            raise HTTPException(422, "invalid_crop")
        x, y, w, h = (crop[k] for k in ("x", "y", "width", "height"))
        if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > 1.000001 or y + h > 1.000001:
            raise HTTPException(422, "invalid_crop")
        image = image.crop(
            (
                round(x * image.width),
                round(y * image.height),
                round((x + w) * image.width),
                round((y + h) * image.height),
            )
        )
        if min(image.size) < 2:
            raise HTTPException(422, "crop_too_small")
    image.thumbnail((2048, 2048))
    return (
        image,
        {
            "capturedAt": captured,
            "location": location,
            "source": "embedded" if captured or location else "missing",
        },
        media,
        warnings,
    )


@lru_cache(maxsize=1)
def image_models():
    import onnxruntime as ort

    runtime = json.loads((ROOT / "models" / "photo-runtime.json").read_text())
    sources = json.loads((ROOT / "model-checksums.json").read_text())
    for name, digest in runtime["sourceChecksums"].items():
        if sources[name] != digest:
            raise RuntimeError("Export source mismatch: " + name)
    for name, digest in runtime["onnxChecksums"].items():
        if hashlib.sha256((ROOT / "models" / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError("Export checksum mismatch: " + name)
    if runtime["classToIndex"] != json.loads((ROOT / "photo-labels.json").read_text()):
        raise RuntimeError("Photo taxonomy does not match the pinned checkpoint")
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    options.add_session_config_entry("session.set_denormal_as_zero", "1")
    options.add_session_config_entry("session.intra_op.allow_spinning", "0")
    classifier = ort.InferenceSession(
        str(ROOT / "models" / "photo-classifier.onnx"),
        options,
        providers=["CPUExecutionProvider"],
    )
    detector = ort.InferenceSession(
        str(ROOT / "models" / "bird-detector.onnx"),
        options,
        providers=["CPUExecutionProvider"],
    )
    return classifier, runtime, detector


def image_tensor(image, size):
    pixels = np.asarray(
        image.resize(tuple(size), Image.Resampling.BICUBIC), dtype=np.float32
    ) / np.float32(255)
    return np.ascontiguousarray(np.moveaxis(pixels, -1, 0)[np.newaxis])


@app.post("/identify/image")
@serialized
def identify_image(
    file: UploadFile = File(),
    crop: str | None = Form(None),
    metadata: str | None = Form(None),
):
    parse_json(metadata, "metadata")
    image, embedded, media, warnings = photo(
        read_upload(file), parse_json(crop, "crop")
    )
    classifier, runtime, detector = image_models()
    _, labels, detection_scores = detector.run(
        None, {"image": image_tensor(image, (320, 320))}
    )
    bird = detection_scores[labels == 16]
    bird_score = float(bird.max()) if len(bird) else 0.0
    tensor = image_tensor(image, runtime["size"])
    tensor -= np.array(runtime["rgbStats"]["mean"], dtype=np.float32)[
        None, :, None, None
    ]
    tensor /= np.array(runtime["rgbStats"]["std"], dtype=np.float32)[
        None, :, None, None
    ]
    logits = classifier.run(None, {"image": tensor})[0][0]
    exp = np.exp(logits - np.max(logits))
    probabilities = exp / exp.sum()
    order = np.argsort(probabilities)[::-1][:5]
    names = {v: k for k, v in runtime["classToIndex"].items()}
    taxonomy = json.loads((ROOT / "photo-taxonomy.json").read_text())
    candidates = []
    raw_candidates = []
    for index in order:
        label = names[int(index)]
        score = float(probabilities[index])
        raw_candidates.append({"modelLabel": label, "score": score})
        if label not in taxonomy:
            warnings.append("unmapped_photo_label:" + label)
            continue
        candidates.append(
            {
                "scientificName": taxonomy[label],
                "commonName": label,
                "score": score,
                "ranges": [],
                "modelLabel": label,
            }
        )
    status = (
        "no_bird"
        if bird_score < 0.35
        else (
            "identified"
            if candidates
            and raw_candidates[0]["modelLabel"] in taxonomy
            and candidates[0]["score"] >= 0.7
            else "uncertain"
        )
    )
    if status == "no_bird":
        candidates = []
    return {
        "status": status,
        "model": "birder/mobilenet_v4_l_eu-common",
        "scoreLabel": "Photo model confidence (uncalibrated softmax)",
        "candidates": candidates,
        "metadata": embedded,
        "warnings": warnings,
        "raw": {
            "media": media,
            "birdDetectionScore": bird_score,
            "candidates": raw_candidates,
        },
    }


@lru_cache(maxsize=1)
def audio_models():
    from ai_edge_litert.interpreter import Interpreter

    models = []
    for name in (
        "BirdNET_GLOBAL_6K_V2.4_Model_FP16",
        "BirdNET_GLOBAL_6K_V2.4_MData_Model_V2_FP16",
    ):
        verify_model(MODEL_ROOT / (name + ".tflite"))
        interpreter = Interpreter(str(MODEL_ROOT / (name + ".tflite")), num_threads=1)
        interpreter.allocate_tensors()
        models.append(interpreter)
    labels = (
        (MODEL_ROOT / "BirdNET_GLOBAL_6K_V2.4_Model_FP16_Labels.txt")
        .read_text()
        .splitlines()
    )
    return *models, labels


@app.post("/identify/audio")
@serialized
def identify_audio(file: UploadFile = File(), metadata: str | None = Form(None)):
    supplied = parse_json(metadata, "metadata") or {}
    data = read_upload(file)
    with tempfile.TemporaryDirectory() as temp:
        path = Path(temp) / "recording"
        path.write_bytes(data)
        try:
            probe = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-protocol_whitelist",
                    "file,pipe",
                    "-show_entries",
                    "format_tags=creation_time,location",
                    "-of",
                    "json",
                    str(path),
                ],
                capture_output=True,
                timeout=20,
            )
            decoded = subprocess.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-nostdin",
                    "-protocol_whitelist",
                    "file,pipe",
                    "-i",
                    str(path),
                    "-t",
                    "61",
                    "-f",
                    "f32le",
                    "-ac",
                    "1",
                    "-ar",
                    "48000",
                    "pipe:1",
                ],
                capture_output=True,
                timeout=20,
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(422, "audio_decode_timeout")
    if decoded.returncode:
        raise HTTPException(415, "unsupported_or_invalid_audio")
    warnings = []
    tags = (
        json.loads(probe.stdout).get("format", {}).get("tags", {})
        if probe.returncode == 0
        else {}
    )
    embedded = {"capturedAt": None, "location": None, "source": "missing"}
    if tags.get("creation_time"):
        try:
            embedded["capturedAt"] = datetime.fromisoformat(
                tags["creation_time"].replace("Z", "+00:00")
            ).isoformat()
        except (ValueError, TypeError):
            warnings.append("invalid_embedded_date")
    match = re.fullmatch(
        r"([+-][0-9.]+)([+-][0-9.]+)(?:[+-][0-9.]+)?/?", tags.get("location", "")
    )
    if match:
        lat, lon = map(float, match.groups())
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            embedded["location"] = {"latitude": lat, "longitude": lon}
    if embedded["capturedAt"] or embedded["location"]:
        embedded["source"] = "embedded"
    supplied = {
        **supplied,
        **{k: v for k, v in embedded.items() if v is not None and k != "source"},
    }
    samples = np.frombuffer(decoded.stdout, dtype="<f4")
    duration = len(samples) / 48000
    if not np.isfinite(samples).all():
        raise HTTPException(422, "invalid_audio_samples")
    if duration > 60.1:
        raise HTTPException(422, "audio_exceeds_60_seconds")
    if duration < 1.5:
        raise HTTPException(422, "audio_too_short")
    model, geo, labels = audio_models()
    allowed = np.ones(len(labels), dtype=bool)
    location = supplied.get("location")
    if location is not None and not isinstance(location, dict):
        raise HTTPException(422, "invalid_location")
    if location is not None:
        lat, lon = location.get("latitude"), location.get("longitude")
        if (
            not isinstance(lat, (int, float))
            or not isinstance(lon, (int, float))
            or not -90 <= lat <= 90
            or not -180 <= lon <= 180
        ):
            raise HTTPException(422, "invalid_location")
        week = -1
        if supplied.get("capturedAt"):
            if not isinstance(supplied["capturedAt"], str):
                raise HTTPException(422, "invalid_capture_date")
            try:
                date = datetime.fromisoformat(
                    supplied["capturedAt"].replace("Z", "+00:00")
                )
                week = min(48, (date.month - 1) * 4 + min(4, (date.day - 1) // 7 + 1))
            except ValueError:
                raise HTTPException(422, "invalid_capture_date")
        geo.set_tensor(
            geo.get_input_details()[0]["index"],
            np.array([[lat, lon, week]], dtype=np.float32),
        )
        geo.invoke()
        allowed = geo.get_tensor(geo.get_output_details()[0]["index"])[0] >= 0.03
    else:
        warnings.append("geographic_filter_not_applied")
    found = {}
    windows = []
    nonbird = set(json.loads((ROOT / "birdnet-nonbird-labels.json").read_text()))
    for start in range(0, len(samples), 144000):
        chunk = samples[start : start + 144000]
        if len(chunk) < 72000:
            break
        chunk = np.pad(chunk, (0, 144000 - len(chunk)))
        model.set_tensor(model.get_input_details()[0]["index"], chunk[np.newaxis, :])
        model.invoke()
        logits = model.get_tensor(model.get_output_details()[0]["index"])[0]
        scores = 1 / (1 + np.exp(-np.clip(0.75 * logits, -80, 80)))
        for index in np.where((scores >= 0.7) & allowed)[0]:
            label = labels[index]
            scientific, _, common = label.partition("_")
            if scientific in nonbird:
                continue
            windows.append(
                {
                    "scientificName": scientific,
                    "score": float(scores[index]),
                    "start": start / 48000,
                    "end": min(duration, start / 48000 + 3),
                }
            )
            item = found.setdefault(
                scientific,
                {
                    "scientificName": scientific,
                    "commonName": common,
                    "modelLabel": label,
                    "score": 0,
                    "ranges": [],
                },
            )
            item["score"] = max(item["score"], float(scores[index]))
            item["ranges"].append(
                {"start": start / 48000, "end": min(duration, start / 48000 + 3)}
            )
    names = json.loads((MODEL_ROOT / "l18n" / "labels_en.json").read_text())
    for item in found.values():
        item["commonName"] = names.get(item["scientificName"], item["scientificName"])
    candidates = sorted(found.values(), key=lambda x: x["score"], reverse=True)
    return {
        "status": "identified" if candidates else "uncertain",
        "model": "BirdNET v2.4",
        "scoreLabel": "Audio model confidence (uncalibrated sigmoid)",
        "candidates": candidates,
        "warnings": warnings,
        "raw": {"durationSeconds": duration, "detections": windows},
        "metadata": embedded,
    }
