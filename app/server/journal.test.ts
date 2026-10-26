import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import worker, { type Env } from "./index";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: "journal",
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: "2025-09-01",
    d1Databases: ["DB"],
    r2Buckets: ["MEDIA"],
  }),
);
let env: Env;
const tasks: Promise<unknown>[] = [];
const ctx = {
  waitUntil(p: Promise<unknown>) {
    tasks.push(p);
  },
  passThroughOnException() {},
  props: {},
} as ExecutionContext;
async function call(
  path: string,
  method = "GET",
  body?: BodyInit,
  authenticated = true,
) {
  return worker.fetch(
    new Request(`http://127.0.0.1:8787${path}`, {
      method,
      headers: {
        ...(authenticated ? { Authorization: "Bearer local-secret" } : {}),
        ...(body instanceof FormData
          ? { "Idempotency-Key": "capture-one" }
          : body
            ? { "Content-Type": "application/json" }
            : {}),
      },
      body,
    }),
    env,
    ctx,
  );
}
beforeAll(async () => {
  env = {
    DB: await mf.getD1Database("DB"),
    MEDIA: (await mf.getR2Bucket("MEDIA")) as unknown as R2Bucket,
    ENVIRONMENT: "local",
    LOCAL_AUTH_TOKEN: "local-secret",
    DEVICE_TOKEN: "device-secret",
  };
  const sql = await readFile(
    new URL("../migrations/0001_initial.sql", import.meta.url),
    "utf8",
  );
  await env.DB.exec(sql);
  await env.DB.exec(
    await readFile(
      new URL("../migrations/0003_processing_lease.sql", import.meta.url),
      "utf8",
    ),
  );
  await env.DB.exec(
    "CREATE TABLE species_aliases(alias TEXT PRIMARY KEY COLLATE NOCASE,species_id TEXT);",
  );
  await env.DB.exec(
    "INSERT INTO species_aliases VALUES('Erithacus rubecula','robin');",
  );
  await env.DB.exec(
    "INSERT INTO species VALUES('robin','Erithacus rubecula','Robin',NULL); INSERT INTO species VALUES('wren','Troglodytes troglodytes','Wren',NULL);",
  );
});
beforeEach(async () => {
  await Promise.all(tasks);
  tasks.length = 0;
  vi.restoreAllMocks();
  env.INFERENCE_URL = undefined;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sightings"),
    env.DB.prepare("DELETE FROM captures"),
  ]);
  const objects = await env.MEDIA.list();
  if (objects.objects.length)
    await env.MEDIA.delete(objects.objects.map((object) => object.key));
});
afterAll(async () => {
  await Promise.all(tasks);
  await mf.dispose();
});
describe("private capture journal", () => {
  it("ignores a late completion from an older processing lease", async () => {
    const form = new FormData();
    form.set("kind", "image");
    form.set("file", new File(["photo"], "lease.jpg", { type: "image/jpeg" }));
    const created = (await (
      await worker.fetch(
        new Request("http://127.0.0.1:8787/api/captures", {
          method: "POST",
          headers: {
            Authorization: "Bearer local-secret",
            "Idempotency-Key": "lease-fence",
          },
          body: form,
        }),
        env,
        ctx,
      )
    ).json()) as { id: string };
    env.INFERENCE_URL = "http://127.0.0.1:8081";
    let finishOld: (response: Response) => void = () => {
      throw new Error("Old request not started");
    };
    const result = (model: string) =>
      Response.json({
        status: "uncertain",
        model,
        scoreLabel: "model confidence",
        candidates: [],
        warnings: [],
        metadata: { capturedAt: null, location: null, source: "missing" },
      });
    const boundary = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce(result("new-lease"));
    const old = call(`/api/captures/${created.id}/process`, "POST");
    await vi.waitFor(() => expect(boundary).toHaveBeenCalledTimes(1));
    await env.DB.prepare(
      "UPDATE captures SET processing_started_at='2026-10-01T00:00:00Z' WHERE id=?",
    )
      .bind(created.id)
      .run();
    await call(`/api/captures/${created.id}`);
    await call(`/api/captures/${created.id}/process`, "POST");
    finishOld(result("old-lease"));
    await old;
    const saved = (await (
      await call(`/api/captures/${created.id}`)
    ).json()) as { status: string; identification: { model: string } };
    expect(saved.status).toBe("review");
    expect(saved.identification.model).toBe("new-lease");
    boundary.mockRestore();
  });

  it("turns abandoned processing into an explicit retry and completes the recovered job", async () => {
    const form = new FormData();
    form.set("kind", "image");
    form.set("file", new File(["photo"], "retry.jpg", { type: "image/jpeg" }));
    const created = (await (
      await worker.fetch(
        new Request("http://127.0.0.1:8787/api/captures", {
          method: "POST",
          headers: {
            Authorization: "Bearer local-secret",
            "Idempotency-Key": "interrupted",
          },
          body: form,
        }),
        env,
        ctx,
      )
    ).json()) as { id: string };
    await env.DB.prepare(
      "UPDATE captures SET status='processing',attempts=1,processing_started_at=?,identification=? WHERE id=?",
    )
      .bind(
        "2026-10-01T00:00:00Z",
        JSON.stringify({
          status: "identified",
          model: "stale",
          warnings: [],
          scoreLabel: "model confidence",
          candidates: [],
          raw: {},
        }),
        created.id,
      )
      .run();
    const interrupted = (await (
      await call(`/api/captures/${created.id}`)
    ).json()) as { status: string; error: string; identification: unknown };
    expect(interrupted.status).toBe("failed");
    expect(interrupted.error).toContain("interrupted");
    expect(interrupted.identification).toBeNull();
    env.INFERENCE_URL = "http://127.0.0.1:8081";
    const boundary = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        status: "uncertain",
        model: "retry-real-boundary",
        scoreLabel: "model confidence",
        candidates: [],
        metadata: { capturedAt: null, location: null, source: "missing" },
        warnings: [],
      }),
    );
    const retried = (await (
      await call(`/api/captures/${created.id}/process`, "POST")
    ).json()) as { status: string; identification: { model: string } };
    expect(retried.status).toBe("review");
    expect(retried.identification.model).toBe("retry-real-boundary");
    boundary.mockRestore();
  });

  it("keeps existing and later audio sightings on the corrected capture date and location", async () => {
    const form = new FormData();
    form.set("kind", "audio");
    form.set(
      "file",
      new File(["birdsong"], "birds.webm", { type: "audio/webm" }),
    );
    form.set(
      "metadata",
      JSON.stringify({
        capturedAt: "2026-10-26T12:00:00Z",
        location: { latitude: 54, longitude: -2 },
        source: "user",
      }),
    );
    const created = (await (
      await worker.fetch(
        new Request("http://127.0.0.1:8787/api/captures", {
          method: "POST",
          headers: {
            Authorization: "Bearer local-secret",
            "Idempotency-Key": "metadata-shared-audio",
          },
          body: form,
        }),
        env,
        ctx,
      )
    ).json()) as { id: string };
    await call(
      `/api/captures/${created.id}/confirm`,
      "POST",
      JSON.stringify({ speciesId: "robin", identifiedBy: "user" }),
    );
    await call(
      `/api/captures/${created.id}`,
      "PATCH",
      JSON.stringify({
        metadata: {
          capturedAt: "2026-10-19T12:00:00Z",
          location: { latitude: 53, longitude: -3 },
          source: "user",
        },
      }),
    );
    await call(
      `/api/captures/${created.id}/confirm`,
      "POST",
      JSON.stringify({ speciesId: "wren", identifiedBy: "user" }),
    );
    const rows = (await (await call("/api/sightings")).json()) as {
      captureId: string;
      capturedAt: string;
      location: { latitude: number; longitude: number };
      identifiedBy: string;
    }[];
    const linked = rows.filter((row) => row.captureId === created.id);
    expect(linked).toHaveLength(2);
    for (const row of linked) {
      expect(row.capturedAt).toBe("2026-10-19T12:00:00Z");
      expect(row.location).toEqual({ latitude: 53, longitude: -3 });
      expect(row.identifiedBy).toBe("user");
    }
    await call(`/api/captures/${created.id}`, "DELETE");
  });

  it("rejects files above 25MiB before persisting capture or original", async () => {
    const before = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM captures",
    ).first<{ count: number }>();
    const mediaBefore = await env.MEDIA.list();
    const form = new FormData();
    form.set("kind", "image");
    form.set(
      "file",
      new File([new Uint8Array(25 * 1024 * 1024 + 1)], "too-large.jpg", {
        type: "image/jpeg",
      }),
    );
    const response = await worker.fetch(
      new Request("http://127.0.0.1:8787/api/captures", {
        method: "POST",
        headers: {
          Authorization: "Bearer local-secret",
          "Idempotency-Key": "oversize",
        },
        body: form,
      }),
      env,
      ctx,
    );
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: string }).error).toContain(
      "25 MiB",
    );
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM captures").first(),
    ).toEqual(before);
    expect((await env.MEDIA.list()).objects).toEqual(mediaBefore.objects);
  });

  it("rejects executable media and cross-site writes", async () => {
    const form = new FormData();
    form.set("kind", "image");
    form.set(
      "file",
      new File(["<svg/>"], "bird.svg", { type: "image/svg+xml" }),
    );
    const response = await worker.fetch(
      new Request("http://127.0.0.1:8787/api/captures", {
        method: "POST",
        headers: {
          Authorization: "Bearer local-secret",
          "Idempotency-Key": "unsafe-image",
        },
        body: form,
      }),
      env,
      ctx,
    );
    expect(response.status).toBe(415);
    const crossSite = await worker.fetch(
      new Request("http://127.0.0.1:8787/api/captures", {
        method: "POST",
        headers: {
          Authorization: "Bearer local-secret",
          Origin: "https://attacker.test",
        },
      }),
      env,
      ctx,
    );
    expect(crossSite.status).toBe(403);
  });

  it("denies private media and spoofed email, and limits device credentials", async () => {
    expect((await call("/api/captures", "GET", undefined, false)).status).toBe(
      401,
    );
    expect(
      (
        await worker.fetch(
          new Request("http://127.0.0.1:8787/api/collection", {
            headers: {
              "Cf-Access-Authenticated-User-Email": "mum@example.test",
            },
          }),
          env,
          ctx,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await worker.fetch(
          new Request("http://127.0.0.1:8787/api/collection", {
            headers: { Authorization: "Bearer device-secret" },
          }),
          env,
          ctx,
        )
      ).status,
    ).toBe(401);
  });
  it("requires metadata, keeps evidence, confirms only after review, and deduplicates retries", async () => {
    const form = new FormData();
    form.set("kind", "audio");
    form.set(
      "file",
      new File(["birdsong"], "bird.webm", { type: "audio/webm" }),
    );
    let response = await call("/api/captures", "POST", form);
    expect(response.status).toBe(201);
    const created = (await response.json()) as { id: string };
    expect(await (await call("/api/collection")).json()).toEqual([]);
    response = await call(
      `/api/captures/${created.id}/confirm`,
      "POST",
      JSON.stringify({ speciesId: "robin", identifiedBy: "user" }),
    );
    expect(response.status).toBe(422);
    expect(
      (
        await call(
          `/api/captures/${created.id}`,
          "PATCH",
          JSON.stringify({
            metadata: {
              capturedAt: "2026-10-20T12:00:00Z",
              location: { latitude: 53.7, longitude: -2.2 },
              source: "user",
            },
          }),
        )
      ).status,
    ).toBe(200);
    const confirm = () =>
      call(
        `/api/captures/${created.id}/confirm`,
        "POST",
        JSON.stringify({ speciesId: "robin", identifiedBy: "user" }),
      );
    const first = (await (await confirm()).json()) as { id: string };
    const repeat = (await (await confirm()).json()) as { id: string };
    expect(first.id).toBe(repeat.id);
    expect(
      (
        await call(
          `/api/captures/${created.id}/confirm`,
          "POST",
          JSON.stringify({ speciesId: "wren", identifiedBy: "model" }),
        )
      ).status,
    ).toBe(400);
    const second = (await (
      await call(
        `/api/captures/${created.id}/confirm`,
        "POST",
        JSON.stringify({ speciesId: "wren", identifiedBy: "user" }),
      )
    ).json()) as { id: string };
    expect(
      ((await (await call("/api/sightings")).json()) as unknown[]).length,
    ).toBe(2);
    await call(`/api/sightings/${first.id}`, "DELETE");
    expect((await call(`/api/media/${created.id}`)).status).toBe(200);
    await call(`/api/sightings/${second.id}`, "DELETE");
    expect((await call(`/api/media/${created.id}`)).status).toBe(404);
    expect(await (await call("/api/collection")).json()).toEqual([]);
  });
});

describe("real persistence with the inference HTTP boundary substituted", () => {
  it("uses embedded photo date over upload context and preserves explicit later corrections", async () => {
    const form = new FormData();
    form.set("kind", "image");
    form.set("file", new File(["photo"], "bird.jpg", { type: "image/jpeg" }));
    form.set(
      "metadata",
      JSON.stringify({
        capturedAt: "2026-10-26T12:00:00Z",
        location: { latitude: 54, longitude: -2 },
        source: "user",
      }),
    );
    const response = await worker.fetch(
      new Request("http://127.0.0.1:8787/api/captures", {
        method: "POST",
        headers: {
          Authorization: "Bearer local-secret",
          "Idempotency-Key": "photo-metadata",
        },
        body: form,
      }),
      env,
      ctx,
    );
    const created = (await response.json()) as { id: string };
    env.INFERENCE_URL = "http://127.0.0.1:8081";
    const boundary = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        status: "identified",
        model: "fixture HTTP model",
        scoreLabel: "model confidence",
        candidates: [
          {
            scientificName: "Erithacus rubecula",
            commonName: "Robin",
            score: 0.8,
            ranges: [],
          },
        ],
        metadata: {
          capturedAt: "2026-08-01T10:00:00Z",
          location: null,
          source: "embedded",
        },
      }),
    );
    await call(`/api/captures/${created.id}/process`, "POST");
    await Promise.all(tasks);
    let saved = (await (await call(`/api/captures/${created.id}`)).json()) as {
      metadata: { capturedAt: string; location: { latitude: number } };
      identification: { candidates: unknown[] };
    };
    expect(saved.metadata.capturedAt).toBe("2026-08-01T10:00:00Z");
    expect(saved.metadata.location).toBeNull();
    expect(saved.identification.candidates).toHaveLength(1);
    await call(
      `/api/captures/${created.id}`,
      "PATCH",
      JSON.stringify({
        metadata: {
          capturedAt: "2026-07-01T10:00:00Z",
          location: { latitude: 53, longitude: -2 },
          source: "user",
        },
      }),
    );
    await call(`/api/captures/${created.id}/process`, "POST");
    await Promise.all(tasks);
    saved = (await (
      await call(`/api/captures/${created.id}`)
    ).json()) as typeof saved;
    expect(saved.metadata.capturedAt).toBe("2026-07-01T10:00:00Z");
    boundary.mockRestore();
    env.INFERENCE_URL = undefined;
  });
});

describe("ambiguous photo metadata", () => {
  it("retains service warnings and requires explicit date interpretation before confirmation", async () => {
    const form = new FormData();
    form.set("kind", "image");
    form.set(
      "file",
      new File(["photo"], "ambiguous.jpg", { type: "image/jpeg" }),
    );
    form.set(
      "metadata",
      JSON.stringify({
        capturedAt: null,
        location: { latitude: 54, longitude: -2 },
        source: "user",
      }),
    );
    const created = (await (
      await worker.fetch(
        new Request("http://127.0.0.1:8787/api/captures", {
          method: "POST",
          headers: {
            Authorization: "Bearer local-secret",
            "Idempotency-Key": "ambiguous-date",
          },
          body: form,
        }),
        env,
        ctx,
      )
    ).json()) as { id: string };
    env.INFERENCE_URL = "http://127.0.0.1:8081";
    const boundary = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        status: "identified",
        model: "fixture",
        scoreLabel: "model confidence",
        candidates: [
          {
            scientificName: "Erithacus rubecula",
            commonName: "Robin",
            score: 0.8,
            ranges: [],
          },
        ],
        metadata: {
          capturedAt: "2026-10-19T10:30:00",
          location: null,
          source: "embedded",
        },
        warnings: ["embedded_date_has_no_timezone", "taxonomy_label_unmapped"],
        raw: { media: { width: 10, height: 10 } },
      }),
    );
    await call(`/api/captures/${created.id}/process`, "POST");
    await Promise.all(tasks);
    boundary.mockRestore();
    env.INFERENCE_URL = undefined;
    const saved = (await (
      await call(`/api/captures/${created.id}`)
    ).json()) as { identification: { warnings: string[] } };
    expect(saved.identification.warnings).toEqual([
      "embedded_date_has_no_timezone",
      "taxonomy_label_unmapped",
    ]);
    expect(
      (
        await call(
          `/api/captures/${created.id}/confirm`,
          "POST",
          JSON.stringify({ speciesId: "robin", identifiedBy: "model" }),
        )
      ).status,
    ).toBe(422);
    await call(
      `/api/captures/${created.id}`,
      "PATCH",
      JSON.stringify({
        metadata: {
          capturedAt: "2026-10-19T09:30:00Z",
          location: { latitude: 54, longitude: -2 },
          source: "user",
        },
      }),
    );
    expect(
      (
        await call(
          `/api/captures/${created.id}/confirm`,
          "POST",
          JSON.stringify({ speciesId: "robin", identifiedBy: "model" }),
        )
      ).status,
    ).toBe(200);
    await call(`/api/captures/${created.id}`, "DELETE");
  });
});
