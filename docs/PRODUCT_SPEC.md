Build a private mobile web app for Joe and his mum that turns captured birdsong and photographs into a confirmed bird collection and an illustrated e-ink collage. Preserve AvianVisitors’ existing visual language. The birthday deadline is **7 November 2026**; target a complete working system by **4 November**, with 5–6 November reserved for physical testing and setup.

The product choices below are settled through the interview. Hosting, model selection, and operational defaults are proposals where labelled. This is a specification and implementation plan; application implementation and deployment have not started.

# Agreed product scope

| Area | Requirement |
| --- | --- |
| Users | Joe and his mum share one private collection. No public gallery or family sharing in the birthday release. |
| Devices | A recent iPhone Pro or Pro Max; exact model and iOS version to confirm during testing. Raspberry Pi 3 A+ with a Pimoroni Inky Impression 7.3-inch display, mounted in portrait. |
| Delivery | An HTTPS web app, accessible by URL, bookmark, or Home Screen icon. No native iOS app, Apple developer membership, or App Store submission. |
| Main locations | Home in Rossendale, Lancashire, and a caravan in Lytham, Lancashire. Outings elsewhere are supported. |
| Location onboarding | Explain why location helps identification and request browser location permission. Offer a manual location fallback if permission is declined or positioning fails. |
| Audio | Tap to start recording; tap to stop earlier or stop automatically at 60 seconds. Preview the recording before submission. |
| Photos | Take a photo or upload from the camera roll. Identify one bird at a time, with optional crop and zoom. |
| Uploads after outings | She can take photographs with her phone and upload later when connected. Read capture date and GPS metadata when available. No custom offline upload queue in the birthday release. |
| Confirmation | Every identification requires confirmation before becoming a sighting or appearing on the frame. Show model confidence appropriately. |
| Corrections | Rejecting a suggestion offers species search and selection from the catalogue, attached to the original capture. |
| Capture requirement | Every sighting must begin with a photo or audio recording. There is no standalone manual bird entry. |
| Media | Retain original photos and recordings privately alongside sightings. |
| Visual style | Keep the upstream illustrated collage, typography, colours, artwork treatment, and design language as faithfully as possible. Actual capture photographs appear in the journal, not on the frame. |
| Display modes | Birds seen this week; rotating selections from the all-time collection; a manually chosen selection of approximately six species. |
| Controls | Manage the collection and frame settings through the web app. The Pi retrieves display content from the hosted service. |

# Capture and confirmation behaviour

**Photographs:** upload the original, extract available metadata before creating derivatives, apply orientation, let her crop or zoom to one bird, and submit that crop for identification. Preserve the original and crop coordinates. A date or location from the photograph takes precedence over upload time or the phone’s current position. Show missing or ambiguous metadata explicitly and allow correction; do not silently describe an old photograph as a sighting at today’s upload location.

**Recordings:** show a timer, stop at 60 seconds, and retain the recorded audio. Convert the browser’s supported format into BirdNET’s expected audio format on the server. Aggregate repeated detections of the same species within one recording into one suggested sighting, with the relevant time ranges retained. A recording can suggest several species for individual confirmation.

**Identification review:** display candidate names, illustrations where available, and model scores. A score must be labelled as model confidence, not a calibrated probability of correctness. The audio and photo models have different score semantics. Manual corrections show “Identified by you”; preserve the original model output separately. Low confidence, no bird, or failed processing must never create a confirmed bird automatically. Offer retry, discard, or species search attached to the capture.

**Collection:** show one species entry with its sighting history. Separate captures of the same species become separate sightings, but never duplicate species tiles in a single collage. Confirmation and retry requests must not accidentally create duplicate sightings.

Proposed handling for unfinished captures: retain them in a review list until confirmed or explicitly deleted. Provide deletion of sightings and their media, keeping a shared recording while any other sighting still references it.

# Frame behaviour and proposed defaults

The agreed display canvas is **480 × 800 in portrait**. The physical panel is 800 × 480, so the driver receives the correctly rotated image. The upstream renderer hardcodes 1200 × 1600 portrait dimensions and must be adapted rather than simply reused unchanged.

The following defaults remain adjustable implementation choices, not additional interview decisions:

| Setting | Proposed default |
| --- | --- |
| This week | Current calendar week, Monday onward, using Europe/London time and the sighting capture date. |
| Species per composition | Up to six distinct species, fewer when the collection is smaller. |
| Weekly overflow | Rotate through compositions when more than six species qualify. |
| All-time rotation | Rotate hourly, including while the phone is closed. Prefer broad coverage over repeatedly showing the most frequently captured bird. |
| Manual selection | Up to six selected species; retain until changed. If a selected species is removed from the collection, remove it from the selection and show that change in the app. |
| Empty week | An honest empty state with an app shortcut to All-time; do not relabel old sightings as this week’s birds. |
| Names | Show bird names initially, subject to a physical legibility check. |
| Device checks | Check for a new image revision approximately every 30 seconds; refresh only when the revision changes. Coalesce rapid setting changes. |
| Connection loss | Keep the last successfully displayed picture. Show last device contact and last acknowledged display revision in the app. |
| Update target | Aim for a visible change within two minutes of confirmation or a settings change while both services are online; validate on the delivered panel. |

A downloaded image and a completed physical refresh are distinct events. Acknowledge the new revision only after a successful panel update. Use one display process at a time, restart automatically after reboot, and retain the previous image if download, validation, or display fails.

Pimoroni lists different refresh times across panel revisions; the current 7.3-inch specification quotes approximately 28 seconds. Verify the delivered revision and driver. [Pimoroni specifications](https://shop.pimoroni.com/products/inky-impression)

# Reuse from AvianVisitors

The inspected baseline is [Twarner491/AvianVisitors at commit 5950f807](https://github.com/Twarner491/AvianVisitors/tree/5950f807b29157fde671ce302788d3f676d4ccca), on the avian-visitors branch, dated 22 October 2026.

| Existing component | Plan |
| --- | --- |
| BirdNET model and Python inference | Retain BirdNET v2.4 weights, labels, segmentation, and applicable location/season filtering. Remove dependencies on the fixed station’s filesystem and configuration. |
| Collage frontend and artwork | Extract reusable rendering and presentation code, retaining the established appearance. Add phone capture and review controls in the same style. |
| PHP API and detection database | Use their species and history behaviour as a reference. Introduce a capture/sighting model rather than pretending photographs are microphone detections. |
| Frame client | Reuse useful display, caching, image validation, and refresh-locking behaviour. Adapt dimensions and driver handling for the 7.3-inch panel. |
| Station installer and administration | Exclude microphone services, live audio streaming, station administration, and unrelated educator or bundle-publication workflows from the application. |

The existing frame can retrieve a ready-made image, which is the preferred integration point. Its checked-in timer runs at 15-minute intervals, so that default does not satisfy the proposed app-controlled update cadence. [Frame source](https://github.com/Twarner491/AvianVisitors/tree/5950f807b29157fde671ce302788d3f676d4ccca/frame)

The upstream licence identifies CC BY-NC-SA terms. Preserve notices and attribution in the derived project. Community artwork requires its own reuse check; being linked by the upstream repository is not a substitute for clear terms. [Upstream licence](https://github.com/Twarner491/AvianVisitors/blob/5950f807b29157fde671ce302788d3f676d4ccca/LICENSE)

# Proposed hosted architecture

Cloudflare is the first candidate because the app, database, media, and on-demand Python processing can stay within one hosting platform. Keep the Pi dedicated to display work.

| Component | Responsibility |
| --- | --- |
| Worker with static assets | Mobile UI, authenticated API, capture/review operations, frame settings, and a lightweight device manifest endpoint. |
| D1 | Collection, species catalogue, capture metadata, sightings, processing status, and display revisions. |
| Private R2 | Originals, processed media, illustration assets, and versioned frame images. |
| Python container | Audio decoding and BirdNET; the selected photo classifier; rendering support if needed. Start for work and allow it to sleep afterward. |
| Pi client | Authenticate independently, poll the manifest, download changed images, refresh the display, and report success. |

Device polling must not wake the inference/rendering container. Persist processing jobs before running them; expose progress and recoverable failure states. Keep media private and validate authentication on every relevant endpoint. Give the device access only to its display content and status endpoint.

For sign-in, evaluate email-code access restricted to the two users with a remembered session. Cloudflare Access is a candidate: verify the experience in both Safari and Home Screen mode before committing to it. It supports email PINs and configurable sessions up to one month. [Access email PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [session settings](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)

The data model needs only a small set of concepts: **Species**, **Capture**, **Identification result**, **Sighting**, and **Frame settings/state**. A capture owns media and capture metadata; a sighting links a confirmed species to that capture. Audio can produce multiple sightings. Store stable species IDs and map scientific-name aliases across BirdNET, the photo model, artwork, and British common names.

Set upload and job limits, bounded retries, and spending alerts. Back up database records and media with a tested restoration path; a database backup alone does not recover photographs.

Cloudflare Workers Paid starts at **US$5/month** with included container usage. R2 Standard includes **10 GB-month of storage** and operation allowances. Additional compute, storage, rendering, domain, and any paid model usage must be included in the measured estimate. The $5 figure is a platform baseline, not a promised total. [Container pricing](https://developers.cloudflare.com/containers/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

If the cloud container probe fails on compatibility, startup latency, or cost, compare the same small container on a managed Python host. Do not move inference onto the Pi or change the user experience silently.

# Identification and artwork checks

**Audio evidence:** a local Linux container limited to one CPU and 1 GiB RAM loaded the bundled BirdNET v2.4 model using TensorFlow Lite. On the repository’s 30-second magpie fixture, model loading took 0.186 seconds, inference took 0.720 seconds, and peak process RSS was 145.4 MiB. The three high-confidence magpie scores reproduced the upstream expected values: 0.9120, 0.9316, and 0.8857. This probe covers raw inference on prepared WAV audio; it does not measure cloud startup, phone decoding, geographic filtering, or end-to-end application latency.

**Photo candidate:** start evaluation with Birder’s **mobilenet_v4_l_eu-common**, an Apache-2.0 model whose card lists 707 classes and numerical class probabilities. Test cropped UK garden and coastal bird photos, difficult lookalikes, small subjects, poor lighting, and images without a bird. Require a way to abstain: a classifier returning a top bird label does not prove that a bird is present. Compare another specialist model if the candidate is inadequate. [Model card](https://huggingface.co/birder-project/mobilenet_v4_l_eu-common)

Photo inference speed, memory, confidence behaviour, and accuracy are still unmeasured. Do not publish numerical accuracy claims from a small smoke test. Select the model after examining results against labelled examples, rather than its name or parameter count.

**Artwork:** the original assets focus on western North America. Upstream links to community sets for [Derbyshire](https://github.com/jonnywright/AvianAssets) and [England](https://github.com/lloydalexporter/AvianAssets_GB-ENG). Check terms, species coverage, and anatomy/style quality before reuse. Prioritise a reviewed set covering likely Rossendale and Lytham sightings; fill gaps through the upstream illustration workflow when reuse is not possible.

Keep species recognition separate from illustration availability. A valid confirmed bird must not be rejected because an illustration is missing. Proposed fallback: retain the sighting, show an explicit artwork-unavailable placeholder, and flag it for Joe to resolve. Do not silently substitute a different species or put unreviewed generated artwork on the frame.

# Implementation sequence

These are target dates, contingent on implementation being authorised and the hardware arriving in time.

| Stage | Target | Deliverable and check |
| --- | --- | --- |
| Prove the uncertain parts | 26–28 October | Exercise iPhone recording, camera-roll/HEIC upload, metadata extraction, and crop behaviour. Run real audio and photo jobs in the proposed cloud runtime. Inspect a 480 × 800 collage preview. Resolve usable UK artwork sources. Record latency, memory, and an estimated monthly bill. |
| Build one complete path | 28–30 October | Create the working fork and isolated branch; add private access, capture storage, photo identification, confirmation/correction, and collection history. A confirmed photo produces a versioned collage image. Unconfirmed uploads do not affect the collection. |
| Complete capture and display controls | 30 October–1 November | Add 60-second audio recording and multi-species review; build metadata correction, all three display modes, and media history/deletion. Verify retries do not duplicate sightings. |
| Connect the physical frame | 1–3 November, or immediately after arrival | Install the lightweight Pi client, configure Wi-Fi and startup, validate portrait dimensions/driver/colour/labels, and exercise app-driven changes and hourly rotation. |
| Finish and restore test | By 4 November | Complete both media flows on an iPhone, test private access and device restrictions, restore a backup, and measure the confirmation-to-frame path. |
| Gift setup and soak test | 5–6 November | Leave the system running, test reboot and network interruption, set up the Home Screen icon and accounts, and prepare simple recovery instructions. Ready for 7 November. |

Implement the photo-to-frame path first so visual quality, model integration, storage, and display changes are exercised together. The original audio model already has a successful local inference probe; the photo model and mobile handling carry more uncertainty.

Ship meaningful behavioural tests with the implementation: capture metadata precedence; confirmation gating; manual correction attached to evidence; repeated detections and retry deduplication; week/timezone boundaries; display selection and rotation; access restrictions; and media deletion with shared references. Use physical checks for camera/microphone permissions, actual iPhone media formats, screen legibility, and panel refresh behaviour.

# Birthday acceptance criteria

- Both users can open the private web app; an unauthorised visitor cannot read media or change the collection.

- Location onboarding works when permission is granted, declined, or unavailable.

- An iPhone photo can be uploaded, cropped, identified, corrected if necessary, and confirmed.

- A photo uploaded later uses its available capture metadata rather than inventing the current location/date.

- Audio stops manually or at 60 seconds, can be played back, and produces reviewable species suggestions.

- Nothing appears in the collection or frame before confirmation; no capture-free manual sightings exist.

- Confirmed sightings retain playable/viewable original evidence and can be revisited.

- This-week, all-time rotation, and manual-selection modes work from the app while retaining the original visual language.

- The physical portrait panel displays the correct composition and names legibly; all-time rotation continues with the phone closed.

- The Pi recovers after reboot and keeps its last good image through connection failure.

- The proposed two-minute online update target is measured rather than assumed.

- A backup restoration recovers both the journal and its media.

# Deferred choices and exclusions

The exact iPhone/iOS version and delivered panel revision need verification during device testing. Cloud hosting and the photo model remain conditional on runtime and quality checks. Artwork reuse terms and visual coverage are a pre-release dependency.

App name, personal dedication, domain, and the proposed display defaults can be settled during polish. Domain, two sign-in addresses, and Wi-Fi credentials are setup inputs, not reasons to reopen the product design; provide credentials through configuration rather than committing them.

Excluded from the birthday scope: native mobile apps; App Store distribution; continuous/background listening; standalone manual sightings; automatic confirmation; offline processing or an offline upload queue; automatic identification of every bird in a photograph; public/family sharing; and displaying original capture photographs on the frame.

Implementation begins only after Joe ends the planning phase and authorises the build.
