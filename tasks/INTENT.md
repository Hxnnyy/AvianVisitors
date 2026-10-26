# Birthday bird journal intent

Product class: private production app for two family members. Tier T2 for media privacy and stored sightings; not a public platform. Target software readiness before hardware arrival Wednesday 28 October 2026, birthday 7 November. Full product spec: docs/PRODUCT_SPEC.md.

## Promises
1. Mum and Joe can privately capture/upload a photo (one selected bird with crop/zoom) or a recording (stop early or 60-second cap), with capture date/location retained or corrected.
2. Every bird identification shows an honest model score and needs confirmation; rejected identifications can be corrected by catalogue search attached to evidence. No standalone manual entries.
3. Confirmed sightings form a persistent collection with original photos/recordings, history, and deletion; retries do not duplicate entries.
4. The web app preserves AvianVisitors' illustrated design and controls a 480x800 portrait collage in weekly, all-time rotation, and manual up-to-six modes; a Pi 3 A+ fetches changed images and retains its last good display.
5. The system is operable as a hosted private web app with a recoverable data store, repeatable deployment, and a device setup guide; meaningful tests and independent audits prove the software. Physical Pi/panel checks remain pending until delivery.

## Non-goals
Native apps/App Store, background listening, public sharing, capture-free manual sightings, automatic confirmation, offline queue/inference, identifying every bird in a photo, photo collage, physical hardware validation before delivery.

## Done scene
Mum opens the phone site, selects a photo and crops the bird, sees suggestions and confidence, confirms or corrects it, and revisits the saved sighting. The app's frame preview changes; the device protocol delivers that same image. She records birdsong and confirms distinct suggested species. Both authorised accounts can use all three frame modes. No unauthorised client can read originals or edit her collection. Before Wednesday demonstrate this in a browser and display-client dry run, with hardware-only checks honestly pending.

## Sign-off
Joe, 26 October 2026: "Amazing. Alright, let's get this built." "Use 6.1-Sol subagents for all implementation and audit - you drive." The complete preceding interview is accepted. No application scope additions without user intent.

