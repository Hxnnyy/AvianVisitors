# Birthday app architecture

The new private app lives in app/; the upstream continuous-listening station remains separately documented below the birthday quickstart in README. Two people share one collection. The Pi only displays illustrations and never runs inference.

A Cloudflare Worker serves the built Vite/React UI and API. D1 holds the species catalogue, capture metadata, original model output, confirmed sightings and frame state. A private R2 bucket holds original evidence under originals/{captureId} and immutable frame PNGs under frames/{revision}. Confirmation is explicit and deduplicated by capture/species. Processing is persisted before dispatch; expired processing leases can be retried. Worker cron rotates eligible frame compositions while the phone is closed.

Production routes inference and rendering through two internal Durable Object namespaces, using one named instance per service. InferenceContainer runs the Python CPU image on standard-1 (4 GiB); RendererContainer runs Node/resvg on basic (1 GiB). Instances sleep after two minutes and thirty seconds respectively. They receive separate bearer credentials through Worker secrets and cannot access the internet. Model weights and reviewed renderer assets are baked into images. Container disks are ephemeral; user data stays in D1/R2. Polling /device/manifest reads persisted state and never starts either container.

The production entry point is server/cloud.ts. The local entry point remains server/index.ts in wrangler.local.jsonc; local-only loopback service URLs connect Docker Compose or native development services. Production refuses URL fallback. This split prevents a local Worker reload from unexpectedly building or starting production container definitions.

See API_CONTRACT.md for endpoints and types; DEPLOYMENT.md for resource setup, actual verification gates and sizing; RECOVERY.md for database plus original-media recovery. Cloud deployment, container cold-start latency and physical panel correctness require explicit evidence before being marked complete.
