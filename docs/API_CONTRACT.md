# Private API contract
All `/api/*` routes require a verified Cloudflare Access JWT (configured issuer/audience and exactly two allowed emails). Local-only development can use a configured bearer token when ENVIRONMENT=local; never enabled in production. Device routes use a separate bearer credential and cannot access user routes. JSON errors are `{error:string}`.

- GET /api/session -> {email}
- GET /api/species?q= -> Species[]
- POST /api/captures multipart: file, kind=image|audio, optional metadata JSON (CaptureMetadata), optional crop JSON (normalized Crop), Idempotency-Key header -> Capture. Original metadata is extracted during processing and takes precedence over supplied upload metadata unless user explicitly corrects after extraction.
- GET /api/captures -> Capture[]; GET /api/captures/:id -> Capture
- PATCH /api/captures/:id JSON {metadata?,crop?} -> Capture (explicit user corrections)
- POST /api/captures/:id/process -> Capture (durable processing lease; foreground inference while request remains connected)
- POST /api/captures/:id/confirm JSON {speciesId,identifiedBy:'model'|'user'} -> Sighting. Requires date and location; unique capture/species. Image confirmation replaces any prior species for that image; audio permits distinct species. Model confirmation requires a candidate.
- DELETE /api/captures/:id -> {ok:true}, including sightings and evidence
- GET /api/collection -> CollectionEntry[]; GET /api/sightings -> Sighting[]
- DELETE /api/sightings/:id -> {ok:true}; original retained while another sighting references capture; final sighting deletion removes capture/media.
- GET /api/media/:captureId -> private original bytes
- GET /api/frame -> FrameState; PUT /api/frame JSON FrameSettings -> FrameState
- GET /api/frame/preview -> image/png (or 404 while no revision)
- GET /device/manifest -> DeviceManifest, updates contact time only
- GET /device/images/:revision -> image/png
- POST /device/ack JSON {revision} -> {ok:true}

Types are in app/shared/contracts.ts. Renderer boundary to be coordinated: Worker calls configured HTTP renderer with species/settings and stores PNG before publishing revision. No rendering/inference on device polling.

Inference: authenticated HTTP POST multipart /identify/image or /identify/audio with `file`, optional `crop` JSON and `metadata` JSON. Returns {model,scoreLabel,candidates:[{scientificName,commonName,score,ranges:[{start,end}]}],metadata?:CaptureMetadata,raw?:unknown}. Canonical scientific names map to seeded species. Unknown labels are retained in raw output, never silently mapped. Worker sends Authorization bearer configured INFERENCE_TOKEN.

## Runtime configuration
`npm ci`, `npm run db:migrate`, `npm run worker:dev` from app. The local launcher creates ignored app/.dev.vars; production uses Worker secrets. Set ENVIRONMENT=local only locally, LOCAL_AUTH_TOKEN, DEVICE_TOKEN, INFERENCE_URL, INFERENCE_TOKEN, RENDERER_URL, RENDERER_TOKEN. Vite's loopback proxy takes DEV_API_TOKEN from its process environment and injects it for local API calls. Production requires ENVIRONMENT=production, ACCESS_ISSUER (https://team.cloudflareaccess.com), ACCESS_AUDIENCE, ALLOWED_EMAILS (exactly two comma separated addresses), APP_ORIGIN, device and service credentials. Access assertions are cryptographically verified; the email header alone is never trusted. User media remains in the private MEDIA R2 binding; never expose that bucket publicly.

D1 migrations contain schema, canonical catalogue with exact case-insensitive aliases, recovery lease and reviewed artwork URLs. Photo/audio uploads are bounded at25MiB and safe MIME types; confirmation needs date and coordinates. Requests need an Idempotency-Key for upload. Processing starts durably before HTTP inference, max5 attempts, three-minute interrupted-job detection on review reads and bounded recovery via minute cron. Failures stay reviewable and correctable; a failed service never confirms a bird.

Identification now includes mandatory status identified|uncertain|no_bird. no_bird never exposes model candidates. Unmapped scientific names remain in raw output and can be corrected by catalogue search. Embedded nonmissing fields take precedence over upload context. Explicit PATCH metadata overrides survive retries.

Renderer POST /render receives {species:Species[],showNames,width:480,height:800}, Bearer RENDERER_TOKEN, returns PNG. Worker selects the composition with app/renderer/schedule.ts, stores immutable frame PNG first, then conditionally publishes revision against the current generation. Minute cron handles autonomous rotation. Device routes only read published content and update contact/ack; they never invoke inference or rendering. Acknowledgement is for the current revision after physical display.

## Verification
`npm test` exercises API entrypoint against real local D1/R2 and renderer/client behavior. HTTP inference is substituted only in the specific deterministic integration fixture; real inference runs through the configured Python service. No remote platform resources are created by tests. Actual Access email-code UX, cloud startup and real iPhone/panel remain deployment/device acceptance checks.

Extraction warnings are persisted as Identification.warnings:string[] and remain visible alongside the full original service response in raw. embedded_date_has_no_timezone prevents confirmation until the user explicitly checks and saves the date/time. PATCH metadata must have source=user and any nonnull date must include Z or an explicit offset. PATCH atomically updates all existing sightings linked to that capture, preserving identification provenance, and invalidates the frame composition. File payload limit25MiB is shared with inference and rejected before media/database persistence.

Production service transport uses private INFERENCE and RENDERER Durable Object namespace bindings to named shared container instances, configured in app/wrangler.jsonc and exported from server/cloud.ts. INFERENCE_URL/RENDERER_URL are accepted only with ENVIRONMENT=local and loopback hostnames; production refuses URL fallback. wrangler.local.jsonc keeps local native/Compose development separate from Cloudflare container lifecycle. The two service tokens are injected into their respective containers, not passed to the browser or device.

The identification POST now awaits HTTP inference in the connected request, avoiding Workers background waitUntil's short post-response lifetime for cold model startup. Keep the review page open while identifying. If the connection disappears, the durable processing lease remains; review reads mark a lease older than three minutes failed with an explicit retry message and clear stale candidates. Retry reclaims the lease and each completion/error is conditional on that exact lease, so late results cannot overwrite a newer attempt. The production minute cron also retries abandoned processing leases within the five-attempt budget. Local development needs no synthetic cron to escape an interrupted status.

For images, missing embedded capture date or GPS remains null even when upload context includes a current phone date/location. Only an explicit user metadata correction can supply missing image facts. Audio keeps the live recording context. Migration0006 applies the final44 reviewed illustration URLs.
