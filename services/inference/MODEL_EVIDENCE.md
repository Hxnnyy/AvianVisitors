# Model evidence — 26 October 2026

These are smoke checks, not an accuracy benchmark. They do not establish general sensitivity, specificity or calibrated confidence.

## Model and provenance

The [Birder model card](https://huggingface.co/birder-project/mobilenet_v4_l_eu-common) specifies 707 classes, 32.2 million parameters, 384 × 384 input, and Apache-2.0 licensing. Weights are pinned to HuggingFace revision `a030bb140c795be62c7052053a9f0b915955a39e`. SHA256 checksums for both photo models and the bundled BirdNET assets are in `model-checksums.json` and checked before loading weights. Uploads can never choose a model path or supply weights.

Birder forces bird classes on nonbirds: a real dog gave Feral pigeon 0.127. Its Unknown class scored only 0.104 on that input. The minimal remedy is an independent torchvision SSDLite320 COCO bird-presence gate, rather than pretending the classifier proves a bird exists. Both networks run on CPU. No paid inference API is used.

The catalogue mapping comes from `artwork/photo-taxonomy.json`: 176 exact classifier labels cover 175 curated UK species. Unknown labels retain their original labels/scores in raw output, with an explicit warning; they are never assigned a guessed scientific name. The checkpoint's complete 707-label mapping is `photo-labels.json`.

Bundled BirdNET/BirdNET-Pi notices remain under the repository's CC BY-NC-SA 4.0 license: K. Lisa Yang Center for Conservation Bioacoustics, Cornell Lab of Ornithology, Cornell University, and Patrick McGuire. The service reuses upstream segmentation and score semantics without importing station configuration or filesystem assumptions. Original notices are copied under `licenses/`, including torchvision BSD-3-Clause and Birder Apache-2.0; they remain in the runtime image after training packages are removed. The downloaded Birder model card is preserved in `model-card.md`; evaluation photos have their own licenses in the fixture attribution file.

## Photo observations

Fixtures and attribution are listed in `tests/fixtures/README.md`. Crops are normalized coordinates in the oriented image. Scores below were observed on native Windows Python 3.12; minor preprocessing and platform differences can change them.

| Input | Class / score | Presence score | Result |
|---|---|---|---|
| Robin | European robin 0.869 | 0.993 | identified, Erithacus rubecula |
| Two tits, whole image | Eurasian blue tit 0.677 | 0.839 | uncertain; choose one bird |
| Blue tit crop, .04/.24/.43/.45 | Eurasian blue tit 0.810 | 0.991 | identified, Cyanistes caeruleus |
| Great tit crop, .35/.55/.50/.28 | Great tit 0.221 | 0.554 | uncertain, Parus major |
| Scarborough herring gull | European herring gull 0.851 | 0.995 | identified, Larus argentatus |
| Robin darkened to 15% brightness | European robin 0.864 | 0.919 | identified |
| Small robin placed in a larger image | European bee-eater 0.034 | 0.055 | no_bird; closer crop needed |
| Real dog | Feral pigeon 0.127 | 0.006 | no_bird; no candidates |
| Blank white image | No reliable species evidence | below threshold | no_bird; no candidates |

The difficult upside-down great tit remains uncertain. The small-subject result is a known false negative. The presence threshold 0.35 and photo identified-status threshold 0.70 are review heuristics, not validated guarantees. Correction and human confirmation remain essential. This smoke evidence supports retaining the candidate provisionally; it does not justify an accuracy claim or a larger model comparison project.

## CPU, latency and memory

An isolated native probe measured the detector at 0.074 s and preprocessing at 0.010 s. The classifier initially took tens of seconds because of denormal floating-point arithmetic. Setting `torch.set_flush_denormal(True)` in each inference worker reduced the same classifier to 0.292 s at one thread. The complete regression suite improved from 323.89 s to 17.12 s without changing model-score assertions. The final native suite, including the timezone fix, passed all 13 tests in 15.74 s.

Fresh native process, with large fixtures generated separately: an 8000 × 6000 JPEG of 1,570,090 bytes returned HTTP 200 in 8.857 s including imports and cold model loading, with process peak 691.7 MiB. The corresponding 48 MP HEIF of 954,002 bytes returned HTTP 200 in 1.800 s warm; process peak was 1244.3 MiB. Original dimensions survived. Earlier approximately 2 GiB peaks included HEIF fixture encoding and must not be reported as inference memory.

These large inputs are upscaled evaluation photographs, not iPhone camera originals. Real iPhone/iOS codec and metadata acceptance remains pending. The service accepts at most 25 MiB per file and 60 MP decoded; the approved production runtime has 4 GiB. The file cap can still reject a large phone original explicitly. These are local measurements, not cloud startup measurements.

## Audio observations

Birder 0.8.4 requires NumPy ≥2.2, while tflite-runtime 2.14 targets NumPy 1 ABI. The service uses official lightweight ai-edge-litert 2.3.0 CPU Interpreter with NumPy 2 instead of full TensorFlow. Native real WAV regression reproduces the independent upstream scores 0.9120, 0.9316 and 0.8857 with explicit sigmoid logit scale 0.75. Actual AAC/M4A and WebM/Opus conversions also produce Pica pica. Geographic/week filtering is exercised with Lancashire coordinates and the fixture capture date. Each recording returns one suggestion per species, with separate ranges and raw per-window scores.

## Cost and remaining acceptance

Local model inference has no per-call API charge. The CPU host, active runtime and stored media still cost money; the proposed Cloudflare US$5 baseline is not an all-in estimate. Hosted cold start and latency need their own measurements; local Linux observations below are not cloud measurements. Actual phone formats, microphone permissions, photography behaviour and physical panel updates remain device acceptance checks.


## Runtime reduction after Linux cold-start evidence

The first real Linux container at the target 0.5 CPU / 4 GiB returned the correct results but took 215.62 s for its first photo request; warm photo requests were 0.41 to 1.51 s. A fresh cached-host bare Torch import was stopped after consuming three minutes of CPU without completing. Separately, initial Docker image unpacking took approximately 792 s. These observations distinguish a problematic framework import from unusually slow local Docker layer I/O; neither is a measured Cloudflare startup time. The full original Linux benchmark is preserved in `linux-torch-reference.json`, including a slow 48 MP HEIF case. It is not the accepted runtime target.

The same pinned classifier and presence network are now exported once in a build stage and loaded through CPU ONNX Runtime. No model or score definition was changed. Original weights are SHA256-checked before export; source hashes, graph hashes, class mapping and export equivalence are stored in `photo-runtime.json` inside the artifact. Runtime graph loading validates that metadata and the exact 707-class mapping. Training frameworks are excluded from the final image.

Native export comparison on the real robin: maximum probability difference 1.57e-9; presence-score difference 1.19e-7. The existing 13-test suite now checks robin, blue-tit and great-tit scores to 1e-5, in addition to the original audio scores. All 13 native tests passed in 7.61 s after export. A fresh native ONNX resource process accepted the same 48 MP JPEG in 1.66 s cold and HEIF in 1.07 s warm, with peak process memory 848.2 MiB. The final Linux ONNX benchmark is recorded when complete.

The initial Linux audio failure was an actual metadata-probe timeout: cold ffprobe took 6.70 s, exceeding its original 5 s budget; FFmpeg decoding itself took 0.188 s. The metadata probe now has a bounded 20 s deadline, matching the existing bounded 20 s audio decode budget. The exact real Magpie regression then passed in a 0.5 CPU / 4 GiB container. Missing or invalid metadata is still explicit; no species result is fabricated to mask a decode failure.


## Final local HTTP gate (accepted image)

Image `avian-inference:onnx-final` (also tagged `:verified`) has immutable ID `sha256:551a5bde0d5e8527b4407cff97def0a89650b4aff7332ea8dfac9446110cd0e0`, size 440,170,699 bytes. It contains neither Torch nor Birder; the build explicitly checks this and then runs all 13 real Linux tests. The final build passed 13/13, including strict numerical photo scores, the three original audio scores, actual AAC/WebM decoding, HEIF orientation metadata, GPS/date precedence and timezone offsets, crop behavior, no-bird results, credential restrictions and upload limits. The final native suite passed the same 13 tests in 7.61 s. ONNX export equivalence passed on Linux with maximum robin probability and bird-presence differences of 1.19e-7. Exact source and derived graph hashes are preserved in `export-evidence-linux.json`.

The actual running Uvicorn service was tested over localhost HTTP under 0.5 CPU and 4 GiB (NanoCPUs 500000000, memory 4294967296). Authenticated health returned 200; unauthenticated health returned 401. The first model request followed health readiness, so these timings exclude the server readiness interval:

| Request | HTTP | Seconds | Result |
|---|---|---:|---|
| Cold robin photo | 200 | 30.63 | Erithacus rubecula, 0.86935925 |
| Warm robin photo | 200 | 0.211 | same score |
| Original 30-second audio | 200 | 68.18 | Pica pica, 0.93164015; correct three ranges |
| Synthetic 48 MP JPEG | 200 | 19.50 | original 8000 x 6000 dimensions retained |
| Synthetic 48 MP HEIF | 200 | 108.91 | original dimensions retained; correct robin |

The final HEIF case completed inside the existing 120-second HTTP gate, but it is close to that limit on this Windows Docker host. It must not be reported as fast or as representative of Cloudflare. Hosted cold-start and real phone acceptance remain release checks. The native HEIF result was 1.07 s; the difference is material and recorded rather than hidden. Actual per-request results are in `http-proof-results.json`. The container did not OOM; the observed constrained memory peak is recorded in `runtime-proof.json`. The disposable proof container was stopped and removed after this finite pass; live application/Compose services were left intact.

The service source bytes in this image and the working tree match SHA256 `bc8e385a325fb2022b0e02515bb9ee9789e34152f24ba3c9f2caa1809a606aed`. This identifies the tested local source bytes, alongside the model hashes and image ID; it is not a claim about a hosted deployment.
