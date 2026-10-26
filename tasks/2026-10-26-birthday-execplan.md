# Birthday web app execution plan

Tier T2: small private app; media/privacy and persistent records justify security and recovery checks, not platform-scale machinery. Intent in INTENT.md; detailed accepted spec in ../docs/PRODUCT_SPEC.md. Operative decisions in STATE.json.

Budget: first build in four implementation dispatches plus one integration dispatch; one coverage audit and one independent integrated audit/walkthrough, with fixes driven by concrete findings. Review cycles maximum three per gate. Work continues through software completion; physical-device proof is explicitly deferred to delivery.

Riskiest assumptions: photo identification quality on phone images, cloud Python compatibility/startup, UK artwork reuse and accuracy. LF-003 and LF-004 probe these first while UI/API proceed behind explicit interfaces. Model candidates win on usable labelled sample performance, honest abstention/confidence, and bounded CPU/memory, not model branding.

Shared contracts must be published by LF-001 before consumers wire integration. Until then consumers implement isolated modules. Keep upstream source intact; new app under app/, Python under services/inference/, device client under device/, asset scripts/manifests under artwork/. Native browser source remains Vite + React + TypeScript; API is a Cloudflare Worker with D1/R2. Use straightforward routing and explicit response types. Docker service provides inference and renderer if necessary. No package changes outside owner coordination.

2026-10-26: personal GitHub fork created, birthday-webapp branch selected. Cloudflare account clarification and two login addresses requested asynchronously. No changes made to inploi infrastructure. Read-only source inventory shows no existing AGENTS.md/RUNS.md in checkout.

Before implementation: independent coverage/intent audit. After credible integration: fresh walkthrough with user brief, then source/security/operations review. Root adjudicates consequences and delegates fixes. Pin completed code in commits and update ledger checks. Do not claim physical iPhone or hardware results from browser emulation.

