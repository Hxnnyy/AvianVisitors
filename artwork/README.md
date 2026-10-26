# UK catalogue and artwork

This bounded birthday catalogue prioritises familiar Rossendale garden/upland and Lytham estuary birds. It is not a complete British list. `species.json` is the application seed: stable scientific-name slugs, UK display names, exact search/taxonomic aliases, model labels, and nullable artwork URLs. Missing artwork never invalidates an identification or sighting. Never substitute a similar bird. Unknown model species remain unknown to this catalogue and must retain their raw result.

Current checked result: 175 species, 176 exact photo labels covering all 175, 44 reviewed transparent PNGs (30 upstream plus fourteen generated), and 131 explicit missing illustrations. The generated birds are Robin, Blue Tit, Great Tit, Blackbird, Wren, Chaffinch, Oystercatcher, Magpie, Dunnock, Long-tailed Tit, Goldfinch, Woodpigeon, Nuthatch and Grey Heron. All fourteen were individually viewed at full size before admission; detailed feature reviews are recorded per file. Raw native previews of Long-tailed Tit and Grey Heron initially appeared to have halos; inspection showed hidden RGB beneath alpha-zero pixels, and compositing onto cream confirmed clean output. No deterministic pixel edits were used. Other missing illustrations include Coal Tit, Tree Sparrow, Greenfinch and Song Thrush; sightings remain supported through the honest unavailable-artwork path.

`uk-species.txt` maintains the chosen names. BirdNET English names come from the checked-in `model/l18n/labels_en.json`; historical genus aliases are explicit. Pied Wagtail maps at species level to Motacilla alba (which also includes White Wagtail); Red Grouse is retained only under the model's Willow Grouse species concept, not represented as an independently identified subspecies. Model output cannot establish subspecies. Blue Tit must never map to African Blue Tit, Robin to American Robin, or European gulls to a newer split without an explicit taxonomy review.

`photo-labels.json` is the 707-class dictionary exported from the real Birder mobilenet_v4_l_eu-common checkpoint (Hugging Face revision a030bb140c795be62c7052053a9f0b915955a39e; checkpoint Apache-2.0). `photo-taxonomy.json` matches exact English labels to curated aliases/BirdNET English names, ignoring only letter case and typographic apostrophes. It does not guess from substrings. Its coverage is deliberately smaller than 707. Python inference should load this map and retain unmapped labels separately.

## Reproduction and verification

From repository root, with Python and Pillow:

```
python artwork/build_catalogue.py
python -m unittest artwork/test_catalogue.py
python app/renderer/build_masks.py
```

The builder copies only the selected, visually approved upstream assets and uses existing generated files with recorded provenance. It never calls an image API. Generated artwork is not bitwise reproducible from a prompt; preserve the checked-in PNGs and their hashes. `assets.json` records each approved file, provenance, licence, modifications, and review scope. `generated.json` records the individual generation sources. `review-upstream.jpg` is the inspected upstream contact sheet, including three rejected candidates. `review-generated.jpg` correctly alpha-composites all fourteen generated cutouts onto cream. Both sheets are review evidence, not application artwork. The admission/test check permits maximum opacity of 254 or 255: the approved Grey Heron output uses 254/255 while its background is fully transparent.

## Reuse review, 26 October 2026

Upstream AvianVisitors at 5950f807b29157fde671ce302788d3f676d4ccca explicitly declares CC-BY-NC-SA-4.0 in README lines 189–191, inherited from BirdNET-Pi; preserve the root LICENSE and Cornell/BirdNET-Pi attribution. This family app is non-commercial. Artwork copied here is unchanged; derivatives retain CC-BY-NC-SA-4.0. Credit AvianVisitors contributors / Twarner491 and link https://github.com/Twarner491/AvianVisitors plus https://creativecommons.org/licenses/by-nc-sa/4.0/ wherever artwork credits are displayed. No author endorsement is implied.

Community sets were inspected through GitHub API root listings, complete recursive trees, README contents and all available commit messages:

* jonnywright/AvianAssets at 022bbdd3b738d560f438da597306eb9c3063a30b: one commit; README describes 604 generated Derbyshire illustrations and explicitly says no full anatomy audit. No licence/copyright or manifest grant found.
* lloydalexporter/AvianAssets_GB-ENG at 50d55757de9f5262a57a2f4a486df05883dd1078: three commits; README describes regeneration and a skim review. No licence/copyright or manifest grant found.

No community PNGs were downloaded or reused. A public repository or upstream link is not a reuse grant. No messages were sent to their authors. Resolve explicit terms before importing either set.

Upstream workflow is `avian/scripts/pregen.py` → `cutout.py` (BiRefNet) → `build_masks.py`, using a target-species reference, optional contrasting lookalike, and `prompt.template.md`. The prompt calls for sparse kachō-e woodblock flat zones. Birthday gap assets use the built-in imagegen tool with an inspected upstream House Sparrow as the style reference, direct transparent output, explicit species anatomy and no perch/background/text. Generated outputs need visual review before manifest admission. These are decorative illustrations, never identification evidence.

Upstream rejected art: Eurasian Teal has the North American vertical white breast bar; Gadwall head/plumage was ambiguous; Sand Martin lacks a clear diagnostic breast band at review scale. All three remain null. Other approved upstream assets passed a contact-sheet review for recognisable features, whole-bird shape and style; this is not expert ornithological certification. Physical e-ink colour and readability remain unverified.
