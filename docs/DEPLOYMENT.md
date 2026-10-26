# Birthday app deployment

The deliverable is a private Worker + D1 + private R2, plus two internal Cloudflare Containers for CPU inference and rendering. The personal Cloudflare account has been selected; OAuth consent and paid-plan activation remain user actions. Use only the explicitly selected personal profile/account. Do not provision this personal app through inherited inploi credentials. Nothing in this document proves a hosted runtime or grants permission to change existing resources.

## Local reproducibility

Prerequisites: PowerShell 7, Docker Desktop with Linux containers, Node 22+ through fnm, npm, Python 3.11+. From the repository root:

```powershell
./scripts/birthday/start-local.ps1
```

The launcher creates app/.dev.vars only when absent, with random, distinct local credentials; builds the two real services; runs npm ci, builds the UI, applies local D1 migrations (including the species catalogue), then serves the Worker/assets on 127.0.0.1:8787 and the built Vite preview on 127.0.0.1:5173. Open port 5173: its server injects the local bearer on API proxy requests. Container ports bind loopback only. The worker's R2/D1 remain local Wrangler state. Never commit .dev.vars or .wrangler state. The launcher passes LOCAL_AUTH_TOKEN to Vite as DEV_API_TOKEN without embedding it in client assets. Direct API calls to 8787 require the local bearer. Access JWT login is a hosted-only check.

The launcher uses built preview, proven stable across upload/PATCH/delete with no browser navigation. For source hot reload, set process DEV_API_TOKEN from LOCAL_AUTH_TOKEN before npm run dev; do not print the value. To stop services: docker compose -f compose.birthday.yaml down. This retains local Worker state; deleting .wrangler loses the local journal/media. Re-running migrations does not erase existing records. Model download/build requires internet and disk space; weights are baked into the inference image, rather than re-downloaded per request. Build failures are failures, never a fixture inference fallback.

## Hosted configuration and release gate

Backend owns app/wrangler.jsonc. Set the real D1 ID, private R2 name, Worker domain and ENVIRONMENT=production. Set Access issuer/audience and exactly two ALLOWED_EMAILS. Add a Cloudflare Access self-hosted application with email PIN policy for only those addresses; verify JWTs in the Worker. Protect UI and user routes, but let /device/* bypass the interactive Access challenge: the Worker validates its separate DEVICE_TOKEN. Device routes use their own bearer; inference and renderer each have a separate bearer. Do not expose private R2 publicly. Production uses INFERENCE and RENDERER Durable Object namespace bindings, with no public service endpoints. server/cloud.ts exports the two Container classes and injects their separate tokens from Worker secrets. INFERENCE_URL/RENDERER_URL are local-only loopback settings. app/wrangler.jsonc declares standard-1 (4 GiB, 0.5 vCPU) inference and basic (1 GiB, 0.25 vCPU) renderer, each capped at one instance; local Compose uses the same 4 GiB/0.5 CPU inference cap for a meaningful cold-path test. See [official instance types](https://developers.cloudflare.com/containers/platform/limits/) and [Container lifecycle configuration](https://developers.cloudflare.com/containers/api/container-class/). Sleep timers are two minutes for inference and thirty seconds for rendering. Docker cold-start and hosted lifecycle checks remain required.

Build and test app, inference, renderer and device before creating new resources. For ad hoc Cloudflare actions use cf cli search and inspect cf schema for the exact command; use --dry-run before production changes. Repository npm scripts may use Wrangler. No uninspected provisioning command is prescribed here. After the correct account is authorised, record account/resource IDs and exact inspected create/export/import commands here, without secrets. Apply migrations/catalogue to a new D1, upload assets, set secrets, deploy Worker/assets, attach Access, then test unauthorised reads, both authorised accounts, capture/review/confirmation, private original playback, all frame modes and device scope.

Roll back code to the previous release only if its schema remains compatible. Back up before migrations. Restore into new D1/R2 first; validate before switching bindings. A code rollback cannot undo deleted originals.

## Limits and spending

This is a two-user app. Local Compose caps inference at 0.5 CPU/4 GiB and renderer at 512 MiB; production uses the valid named sizes above. Native combined photo models measured about 680 MiB RSS before large-phone-photo decoding, so 1 GiB inference is not selected. Measure the hosted cold/warm latency and peak memory before reducing its 4 GiB allocation. Keep the 60-second audio limit and backend upload bounds. Avoid public inference endpoints or an unbounded queue. Device polling only reads existing revisions and must not start inference. Configure billing alerts before production, review usage after the first day and week, and shut down idle paid hosts when unused. Alerts are notifications, not spending caps. Do not promise a monthly total until real container startup/runtime, image storage and request measurements exist; Workers' base plan alone is not the app's total cost.




Hosted timing gate: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) allow HTTP waitUntil work only thirty seconds after response/disconnect. Identification now awaits processing in the foreground; its 120-second service timeout still needs to exceed real container cold allocation plus model loading. Scheduled recovery has a longer cron lifetime. Frame rendering remains background work, so measure a genuinely cold render within thirty seconds or move completion under durable execution. Persisted lease recovery is not a substitute for the promised normal response time.


