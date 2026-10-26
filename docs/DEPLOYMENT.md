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

Build and test app, inference, renderer and device before creating new resources. For ad hoc Cloudflare actions use cf cli search and inspect cf schema for the exact command; use --dry-run before production changes. Repository npm scripts may use Wrangler. No uninspected provisioning command is prescribed here. After the correct account is authorised, record account/resource IDs and exact inspected create/export/import commands here, without secrets. Apply migrations/catalogue to a new D1, upload assets, set secrets, deploy Worker/assets, attach Access, then test unauthorised reads and the owner account, capture/review/confirmation, private original playback, all frame modes and device scope.

Roll back code to the previous release only if its schema remains compatible. Back up before migrations. Restore into new D1/R2 first; validate before switching bindings. A code rollback cannot undo deleted originals.

## Limits and spending

This is a two-user app. Local Compose caps inference at 0.5 CPU/4 GiB and renderer at 512 MiB; production uses the valid named sizes above. An earlier Torch-native probe measured about 680 MiB RSS; final ONNX cgroup peaks are recorded below. Large-phone-photo decoding needs additional headroom, so 1 GiB inference is not selected. Measure the hosted cold/warm latency and peak memory before reducing its 4 GiB allocation. Keep the 60-second audio limit and backend upload bounds. Avoid public inference endpoints or an unbounded queue. Device polling only reads existing revisions and must not start inference. Configure billing alerts before production, review usage after the first day and week, and shut down idle paid hosts when unused. Alerts are notifications, not spending caps. Do not promise a monthly total until real container startup/runtime, image storage and request measurements exist; Workers' base plan alone is not the app's total cost.

Hosted timing gate: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) allow HTTP waitUntil work only thirty seconds after response/disconnect. Identification now awaits processing in the foreground; its 120-second service timeout still needs to exceed real container cold allocation plus model loading. Scheduled recovery has a longer cron lifetime. Frame rendering remains background work, so measure a genuinely cold render within thirty seconds or move completion under durable execution. Persisted lease recovery is not a substitute for the promised normal response time.

The two allowed email addresses are configuration only. Do not invite or email the gift recipient or trigger her login PIN during setup. The owner can test login; recipient onboarding remains a birthday setup check. Hosted account consent/paid-plan activation, actual Access/device route checks, a fresh-resource cloud restoration and physical phone/panel checks remain acceptance gates, not requests to send anyone a message.

## Access hostname and device-path contract

Use one same-origin HTTPS hostname for browser HTML, static assets and /api/*. Protect that entire hostname with an Access self-hosted application using email PIN and the two-address allow policy. The initial top-level page navigation establishes the Access session before any API fetch; protecting only /api/* would leave XHR requests trying to follow an interactive login redirect and is not the chosen setup. Worker JWT verification remains mandatory for every user API request.

Create a second, more-specific Access application scoped only to that hostname's /device path (covering /device/*), with Bypass / Include Everyone. Cloudflare's [application-path precedence](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/) gives this narrow application precedence over the hostname application. [Bypass](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/common-policies/) removes Access interception, not Worker authentication: every device manifest/image/ack request still requires DEVICE_TOKEN, and that token cannot authorise /api/*. Do not bypass the hostname, /api, static assets or containers. Both containers remain internal Durable Object bindings with their independent service credentials.

Before provisioning, choose the single canonical hostname and disable or separately protect any workers.dev/preview alternative; an unprotected alternate hostname must not become an alternate browser login path. Hosted validation must show: unsigned HTML navigates to Access; the owner signs in by top-level navigation; subsequent same-origin XHR returns JSON; invalid/missing user JWT is denied at the Worker; a Pi request without an Access cookie but with the separate device bearer reaches only /device/*; missing/wrong device bearer returns 401 rather than an Access login page. No hosted Access UX or route precedence is claimed until these checks pass. Do not trigger the recipient's PIN as part of the test.


## Final local runtime evidence — 26 October 2026

The final local stack uses Worker 8787 and built preview 5173 with real Compose services on 8081/8082. No cloud resources were contacted or changed by these checks.

| Evidence | Result |
| --- | --- |
| Inference image | avian-inference:onnx-final, sha256:551a5bde0d5e8527b4407cff97def0a89650b4aff7332ea8dfac9446110cd0e0; 440,170,699 bytes; 13 Linux tests and no-Torch/no-Birder runtime guard passed |
| Inference source | service.py SHA256 bc8e385a325fb2022b0e02515bb9ee9789e34152f24ba3c9f2caa1809a606aed, identical inside image and checkout |
| Renderer image | avian-renderer:verified, sha256:3959d1856b55dcccb0d4862329e28919f7171aa2931e82b2b502e93dcfb63b4f; server, composition, raster and 44-artwork masks match checkout |
| Compose startup to both healthy | 17.16 seconds, existing local images |
| Actual inference resource limits | cgroup cpu.max 50000/100000 (0.5 CPU), memory.max 4,294,967,296 bytes (4 GiB) |
| Full Worker→inference photo cold process | 94.636 seconds; Robin model score 0.8693592548; explicit confirmation; original 83,447 bytes SHA256 preserved |
| Full Worker→inference audio cold process | 50.667 seconds; Magpie model score 0.9316401482; explicit confirmation; original 2,880,044 bytes SHA256 preserved |
| Independent direct HTTP inference probe | Same final image / 0.5 CPU / 4 GiB: photo cold 30.63 seconds, warm 0.211 seconds. This excludes Worker/D1/R2 processing overhead |
| Frame/device path | Follow-up required the exact expected two-species revision, downloaded its 480×800 PNG (96,644 bytes), and visually verified both labelled birds. After deletion it required the exact empty revision and verified the empty-state PNG (10,980 bytes). No physical acknowledgement was simulated |
| Measured cgroup memory peaks | Inference 589,975,552 bytes (~563 MiB); renderer 157,761,536 bytes (~150 MiB), renderer local cap 512 MiB |
| Cleanup | Disposable captures and confirmed collection entries both returned to zero; prior frame settings restored |
| Worker deployment dry-run | Current Worker/assets/DO bindings compiled; 52 assets, 116.63 KiB Worker. --containers-rollout none deliberately skipped rebuilding already independently tested images; no upload |
| Recovery | 4 offline tests pass, including real schema/sighting/original restoration and inspected CLI command/profile/account checks; live cloud restore remains unproved |

Cold probes ran concurrently on the same Docker Desktop host, so contention may affect these local numbers. Report both direct and full-chain results; neither is a hosted latency measurement. The current 120-second service timeout has limited measured headroom on the full cold path. Actual Cloudflare cold allocation, foreground processing, background rendering and Access/device routing must pass before phone handoff. Do not increase timeouts or instance size speculatively. Minute cron computes the composition hash before calling the renderer; an unchanged or already-published empty composition does not wake its container.




A narrow publication follow-up closed an earlier evidence gap: the initial 143,336-byte device download was only an available Robin frame, not proof that both confirmed species had reached the frame. The follow-up used normal real photo/audio API processing, explicit metadata and model confirmation, with All-time/names enabled. Warm photo processing plus confirmation took 0.273 seconds; audio took 0.994 seconds. After both confirmations, the independently computed expected composition revision 865f667cd736f5a6db660f066d2fe8f507359f8a72ac2f0be19368fb0c60dd6f matched the device manifest within 0.519 seconds. Its 96,644-byte PNG SHA256 was cac490fb314a29ad4fe5ae7464f8e2cd0ba72c5d9c2d24acec7000f68100ad2b; visual inspection showed both Magpie and Robin with their correct names.

Deleting those two disposable captures returned both capture and collection lists to zero. The expected empty revision 6b0e3d94abcf5682f87115ed11ccaefb20b8cfca0f71f0e8eaadd40da78f1cb8 matched within 0.520 seconds; its 10,980-byte PNG SHA256 was 08051aced02068b870f994e1ba672b7e769007fbca63b8c95141b048439c2d9b. Visual inspection showed only “No birds in this selection yet”. Prior frame settings were restored. These are local software publication checks, not physical panel acknowledgements or hosted latency measurements.

