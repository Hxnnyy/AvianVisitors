# Model evidence — 26 October 2026

These are smoke checks, not an accuracy benchmark. They do not establish general sensitivity, specificity or calibrated confidence.

## Model and provenance

The [Birder model card](https://huggingface.co/birder-project/mobilenet_v4_l_eu-common) specifies 707 classes, 32.2 million parameters, 384 × 384 input, and Apache-2.0 licensing. Weights are pinned to HuggingFace revision `a030bb140c795be62c7052053a9f0b915955a39e`. SHA256 checksums for both photo models and the bundled BirdNET assets are in `model-checksums.json` and checked before loading weights. Uploads can never choose a model path or supply weights.

Birder forces bird classes on nonbirds: a real dog gave Feral pigeon 0.127. Its Unknown class scored only 0.104 on that input. The minimal remedy is an independent torchvision SSDLite320 COCO bird-presence gate, rather than pretending the classifier proves a bird exists. Both networks run on CPU. No paid inference API is used.

The catalogue mapping comes from `artwork/photo-taxonomy.json`: 176 exact classifier labels cover 175 curated UK species. Unknown labels retain their original labels/scores in raw output, with an explicit warning; they are never assigned a guessed scientific name. The checkpoint's complete 707-label mapping is `photo-labels.json`.

Bundled BirdNET/BirdNET-Pi notices remain under the repository's CC BY-NC-SA 4.0 license: K. Lisa Yang Center for Conservation Bioacoustics, Cornell Lab of Ornithology, Cornell University, and Patrick McGuire. The service reuses upstream segmentation and score semantics without importing station configuration or filesystem assumptions. Torchvision package BSD-3-Clause notices remain in its installed distribution. The downloaded Birder model card is preserved in `model-card.md`; evaluation photos have their own licenses in the fixture attribution file.

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

Local model inference has no per-call API charge. The CPU host, active runtime and stored media still cost money; the proposed Cloudflare US$5 baseline is not an all-in estimate. Cloud cold start, final Linux limits and hosted latency need their own measurements. Actual phone formats, microphone permissions, photography behaviour and physical panel updates remain device acceptance checks.
