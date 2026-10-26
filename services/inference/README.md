# CPU identification service

The service runs the bundled BirdNET v2.4 TFLite weights through official LiteRT CPU Interpreter, plus the same pinned Birder MobileNet v4 large eu-common classifier and COCO bird-presence detector, exported to ONNX during the build. It uses no uploaded weights, URL inputs, generated identifications or paid inference APIs. Model sources, licenses, exact checksums, measured results and limitations are recorded in `MODEL_EVIDENCE.md`.

Build from the repository root:

```powershell
docker build -f services/inference/Dockerfile -t avian-inference:verified .
docker run --rm --cpus 0.5 --memory 4g -p 127.0.0.1:8081:8081 -e INFERENCE_TOKEN=$env:INFERENCE_TOKEN avian-inference:verified
```

Set a generated private `INFERENCE_TOKEN`, shared with the Worker. Production fails closed without it, including requests from a local reverse proxy. Every route, including health, requires `Authorization: Bearer <token>` when configured. Docker disables proxy-header rewriting. Native development permits an unconfigured token only on loopback; bind native Uvicorn to 127.0.0.1. Keep the container port internal or loopback and terminate HTTPS at the application gateway.

`GET /health` returns `{status:'ok',device:'cpu'}`. This confirms process readiness; first inference loads the models. `POST /identify/image` and `/identify/audio` accept multipart `file` and optional `metadata` JSON. Image also accepts normalized `crop` JSON `{x,y,width,height}` in the oriented original. Responses conform to `docs/API_CONTRACT.md`, with additional `status`, `warnings`, model labels and raw evidence. Errors are `{error:string}` with HTTP 400/401/413/415/422/503 as applicable.

Photo metadata is read before derivatives. `metadata` has capturedAt/location/source; original dimensions and orientation are in `raw.media`. Missing values remain null. Embedded date/GPS take precedence over upload metadata. The HEIF decoder normalizes its container orientation; the original EXIF orientation tag is retained separately as `raw.media.originalExifOrientation` without a second rotation. A valid EXIF timezone offset is preserved; an absent offset produces an explicit warning so the app can ask for correction. Crops apply after orientation and retain source detail before resizing to a 2048 px working image and the classifier's 384 px input. Uncropped JPEGs use draft decoding. HEIC uses pillow-heif.

Limits are 25 MiB per file, 26 MiB multipart and 60 MP decoded images. A synthetic 48 MP JPEG and HEIF were actually accepted within the measured resource budget; this is not a guarantee for every phone encoding. Originals are never modified or stored here. Real iPhone format, metadata and orientation acceptance remains a device check.

Audio is decoded with FFmpeg to mono 48 kHz float32, with a 60-second recording limit and bounded decode time. Minimum duration is 1.5 seconds. Three-second windows follow upstream segmentation: a final window of at least 1.5 seconds is zero-padded; shorter tails are ignored. Repeated species produce one candidate with maximum score and separate ranges. Raw window scores remain in `raw.detections`. Geographic/week filtering uses the bundled v2 metadata model at occurrence threshold 0.03 when location is supplied. Missing date uses week=-1; missing location produces a warning. Embedded creation_time/location take precedence where available.

Scores are uncalibrated: photo softmax and audio sigmoid with explicit logit scale 0.75. The photo presence threshold 0.35 and identified-status threshold 0.70 are review heuristics. The gate can miss small birds: offer a closer crop, retry or correction search. Unknown classifier labels remain raw with warnings, never guessed scientific names. No result confirms a sighting automatically.

All weights download at build time from pinned sources and are checked before loading. Runtime does not need model downloads. Direct package versions are pinned. PyTorch, torchvision and Birder exist only in the export stage; production uses lightweight CPU ONNX Runtime and LiteRT. Export checks compare the original and exported network outputs, and the runtime validates both source identities and derived graph checksums. Use one worker: mutable interpreters require serialized model calls. Uvicorn bounds concurrent requests. ONNX sessions use one thread, no thread spinning and explicit denormal flushing. HEIF decoding also uses one thread for the CPU budget.

The Docker build runs all 13 real behavior tests. Repeat the focused gate with:

```powershell
docker run --rm --cpus 0.5 --memory 4g avian-inference:verified python -m pytest -q
```

Native Windows uses the same graphs. Install CPU PyTorch/torchvision plus `requirements.txt` and ONNX Runtime 1.31.1 for export, run `download_models.py` and `export_photo.py`, then `.venv/Scripts/python.exe -m pytest -q` runs the full suite. `requirements-runtime.txt` is sufficient after export. `evaluate_quality.py` records the small quality smoke set. `evaluate_resources.py` generates and then reuses large inputs; measure decoding in a fresh second process so fixture encoding is excluded from peak memory. `benchmark.py` records Linux route latency, process RSS and cgroup limits/peak. Fixtures and attribution are explicit under `tests/fixtures/` and are never production results.
