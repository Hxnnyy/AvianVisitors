import { selectSpecies } from "../renderer/schedule";
import { serviceRequest, type ServiceEnvironment } from "./service-request";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type {
  Capture,
  CaptureMetadata,
  Crop,
  Identification,
  Species,
  Sighting,
  FrameSettings,
  FrameState,
} from "../shared/contracts";
export interface Env extends ServiceEnvironment {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS?: Fetcher;
  ENVIRONMENT?: string;
  APP_ORIGIN?: string;
  LOCAL_AUTH_TOKEN?: string;
  ALLOWED_EMAILS?: string;
  ACCESS_ISSUER?: string;
  ACCESS_AUDIENCE?: string;
  DEVICE_TOKEN?: string;
  INFERENCE_URL?: string;
  INFERENCE_TOKEN?: string;
  RENDERER_URL?: string;
  RENDERER_TOKEN?: string;
}
type CaptureRow = {
  id: string;
  kind: "image" | "audio";
  status: Capture["status"];
  metadata: string;
  crop: string | null;
  identification: string | null;
  error: string | null;
  created_at: string;
  media_type: string;
  metadata_corrected: number;
  attempts: number;
  processing_started_at: string | null;
};
type SpeciesRow = {
  id: string;
  scientific_name: string;
  common_name: string;
  artwork_url: string | null;
};
type SightingRow = {
  id: string;
  capture_id: string;
  species_id: string;
  identified_by: "model" | "user";
  captured_at: string;
  location: string;
  created_at: string;
};
type FrameRow = {
  settings: string;
  revision: string | null;
  last_contact_at: string | null;
  acknowledged_revision: string | null;
  error: string | null;
  dirty: number;
};
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const species = (r: SpeciesRow): Species => ({
  id: r.id,
  scientificName: r.scientific_name,
  commonName: r.common_name,
  artworkUrl: r.artwork_url,
});
const capture = (r: CaptureRow): Capture => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  metadata: JSON.parse(r.metadata),
  crop: r.crop ? JSON.parse(r.crop) : null,
  identification: r.identification ? JSON.parse(r.identification) : null,
  error: r.error,
  createdAt: r.created_at,
  originalUrl: `/api/media/${r.id}`,
});
const sighting = (r: SightingRow): Sighting => ({
  id: r.id,
  captureId: r.capture_id,
  speciesId: r.species_id,
  identifiedBy: r.identified_by,
  capturedAt: r.captured_at,
  location: JSON.parse(r.location),
  createdAt: r.created_at,
});
async function authenticated(
  request: Request,
  env: Env,
): Promise<string | null> {
  const bearer = request.headers.get("Authorization");
  if (
    env.ENVIRONMENT === "local" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(request.url).hostname,
    ) &&
    env.LOCAL_AUTH_TOKEN &&
    bearer === `Bearer ${env.LOCAL_AUTH_TOKEN}`
  )
    return "local@example.invalid";
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_ISSUER || !env.ACCESS_AUDIENCE) return null;
  try {
    const issuer = env.ACCESS_ISSUER.replace(/\/$/, "");
    const result = await jwtVerify(
      token,
      createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
      { issuer, audience: env.ACCESS_AUDIENCE },
    );
    const email = result.payload.email;
    const allowed = (env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return typeof email === "string" &&
      allowed.length === 2 &&
      allowed.includes(email.toLowerCase())
      ? email
      : null;
  } catch {
    return null;
  }
}
function metadata(value: unknown): CaptureMetadata {
  if (typeof value !== "object" || value === null)
    throw new HttpError(400, "Invalid metadata");
  const v = value as Record<string, unknown>;
  if (
    v.capturedAt !== null &&
    (typeof v.capturedAt !== "string" ||
      !Number.isFinite(Date.parse(v.capturedAt)))
  )
    throw new HttpError(400, "Invalid capture date");
  let location = null;
  if (v.location !== null) {
    if (typeof v.location !== "object" || v.location === null)
      throw new HttpError(400, "Invalid location");
    const l = v.location as Record<string, unknown>;
    if (
      typeof l.latitude !== "number" ||
      typeof l.longitude !== "number" ||
      !Number.isFinite(l.latitude) ||
      !Number.isFinite(l.longitude) ||
      Math.abs(l.latitude) > 90 ||
      Math.abs(l.longitude) > 180
    )
      throw new HttpError(400, "Invalid location");
    location = { latitude: l.latitude, longitude: l.longitude };
  }
  return {
    capturedAt: v.capturedAt as string | null,
    location,
    source:
      v.source === "embedded"
        ? "embedded"
        : v.source === "user"
          ? "user"
          : "missing",
  };
}
function cropValue(value: unknown): Crop | null {
  if (value === null) return null;
  if (typeof value !== "object") throw new HttpError(400, "Invalid crop");
  const c = value as Record<string, unknown>;
  for (const key of ["x", "y", "width", "height"])
    if (
      typeof c[key] !== "number" ||
      !Number.isFinite(c[key]) ||
      c[key] < 0 ||
      c[key] > 1
    )
      throw new HttpError(400, "Crop must use normalized coordinates");
  if (
    Number(c.width) <= 0 ||
    Number(c.height) <= 0 ||
    Number(c.x) + Number(c.width) > 1 ||
    Number(c.y) + Number(c.height) > 1
  )
    throw new HttpError(400, "Crop exceeds image");
  return {
    x: Number(c.x),
    y: Number(c.y),
    width: Number(c.width),
    height: Number(c.height),
  };
}
async function expireInterruptedCaptures(env: Env) {
  await env.DB.prepare(
    "UPDATE captures SET status='failed',identification=NULL,error='Identification interrupted. Retry identification while keeping this page open.' WHERE status='processing' AND (processing_started_at IS NULL OR processing_started_at < ?)",
  )
    .bind(new Date(Date.now() - 180000).toISOString())
    .run();
}
async function getCapture(env: Env, id: string) {
  const row = await env.DB.prepare("SELECT * FROM captures WHERE id=?")
    .bind(id)
    .first<CaptureRow>();
  if (!row) throw new HttpError(404, "Capture not found");
  return row;
}
async function removeCapture(env: Env, id: string) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sightings WHERE capture_id=?").bind(id),
    env.DB.prepare("DELETE FROM captures WHERE id=?").bind(id),
    env.DB.prepare("UPDATE frame SET dirty=dirty+1 WHERE id=1"),
  ]);
  await env.MEDIA.delete(`originals/${id}`);
}
async function state(env: Env): Promise<FrameState> {
  const row = await env.DB.prepare(
    "SELECT * FROM frame WHERE id=1",
  ).first<FrameRow>();
  if (!row) throw new Error("Frame database not initialized");
  return {
    settings: JSON.parse(row.settings),
    revision: row.revision,
    imageUrl: row.revision ? "/api/frame/preview" : null,
    lastContactAt: row.last_contact_at,
    acknowledgedRevision: row.acknowledged_revision,
    error: row.error,
  };
}
async function processCapture(env: Env, id: string) {
  const row = await getCapture(env, id);
  try {
    const original = await env.MEDIA.get(`originals/${id}`);
    if (!original) throw new Error("Original media is missing");
    const form = new FormData();
    form.set(
      "file",
      new Blob([await original.arrayBuffer()], { type: row.media_type }),
      `${id}.${row.kind === "audio" ? "audio" : "image"}`,
    );
    form.set("metadata", row.metadata);
    if (row.crop) form.set("crop", row.crop);
    const response = await serviceRequest(
      env,
      "inference",
      `/identify/${row.kind}`,
      {
        method: "POST",
        signal: AbortSignal.timeout(120000),
        headers: { Authorization: `Bearer ${env.INFERENCE_TOKEN ?? ""}` },
        body: form,
      },
    );
    if (!response.ok)
      throw new Error(`Identification service failed (${response.status})`);
    const output = (await response.json()) as {
      status: Identification["status"];
      model: string;
      scoreLabel: string;
      candidates: {
        scientificName: string;
        commonName: string;
        score: number;
        ranges: { start: number; end: number }[];
      }[];
      metadata?: CaptureMetadata;
      warnings?: string[];
      raw?: unknown;
    };
    if (
      !["identified", "uncertain", "no_bird"].includes(output.status) ||
      typeof output.model !== "string" ||
      typeof output.scoreLabel !== "string" ||
      !Array.isArray(output.candidates)
    )
      throw new Error("Invalid identification response");
    if (
      output.warnings !== undefined &&
      (!Array.isArray(output.warnings) ||
        output.warnings.some((warning) => typeof warning !== "string"))
    )
      throw new Error("Invalid identification warnings");
    const candidates: Identification["candidates"] = [];
    for (const candidate of output.status === "no_bird"
      ? []
      : output.candidates) {
      if (!Number.isFinite(candidate.score))
        throw new Error("Invalid model score");
      const found = await env.DB.prepare(
        "SELECT species.* FROM species JOIN species_aliases ON species_aliases.species_id=species.id WHERE species_aliases.alias=? COLLATE NOCASE",
      )
        .bind(candidate.scientificName)
        .first<SpeciesRow>();
      if (found && !candidates.some((c) => c.speciesId === found.id))
        candidates.push({
          ...candidate,
          speciesId: found.id,
          commonName: found.common_name,
        });
    }
    const identification: Identification = {
      status: output.status,
      warnings: output.warnings ?? [],
      model: output.model,
      scoreLabel: output.scoreLabel,
      candidates,
      raw: output,
    };
    const supplied: CaptureMetadata = JSON.parse(row.metadata);
    const embedded = output.metadata ? metadata(output.metadata) : null;
    const extracted: CaptureMetadata =
      row.kind === "image"
        ? (embedded ?? { capturedAt: null, location: null, source: "missing" })
        : embedded
          ? {
              capturedAt: embedded.capturedAt ?? supplied.capturedAt,
              location: embedded.location ?? supplied.location,
              source: embedded.source,
            }
          : supplied;
    await env.DB.prepare(
      "UPDATE captures SET status=?,identification=?,metadata=?,error=NULL WHERE id=? AND status='processing' AND processing_started_at=?",
    )
      .bind(
        "review",
        JSON.stringify(identification),
        row.metadata_corrected ? row.metadata : JSON.stringify(extracted),
        id,
        row.processing_started_at,
      )
      .run();
  } catch (error) {
    await env.DB.prepare(
      "UPDATE captures SET status='failed',error=? WHERE id=? AND status='processing' AND processing_started_at=?",
    )
      .bind(
        error instanceof Error ? error.message : "Identification failed",
        id,
        row.processing_started_at,
      )
      .run();
  }
}
async function route(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (path === "/health") return json({ ok: true });
  if (path.startsWith("/device/")) {
    if (
      !env.DEVICE_TOKEN ||
      request.headers.get("Authorization") !== `Bearer ${env.DEVICE_TOKEN}`
    )
      throw new HttpError(401, "Device authentication required");
    if (path === "/device/manifest" && method === "GET") {
      await env.DB.prepare("UPDATE frame SET last_contact_at=? WHERE id=1")
        .bind(new Date().toISOString())
        .run();
      const f = await state(env);
      return json({
        revision: f.revision,
        imageUrl: f.revision ? `/device/images/${f.revision}` : null,
        width: 480,
        height: 800,
      });
    }
    if (path.startsWith("/device/images/") && method === "GET") {
      const revision = path.split("/")[3];
      const f = await state(env);
      if (revision !== f.revision)
        throw new HttpError(404, "Revision not found");
      return image(env, revision);
    }
    if (path === "/device/ack" && method === "POST") {
      const body = (await request.json()) as { revision?: unknown };
      const f = await state(env);
      if (typeof body.revision !== "string" || body.revision !== f.revision)
        throw new HttpError(409, "Revision is not current");
      await env.DB.prepare(
        "UPDATE frame SET acknowledged_revision=?,last_contact_at=? WHERE id=1",
      )
        .bind(body.revision, new Date().toISOString())
        .run();
      return json({ ok: true });
    }
    throw new HttpError(404, "Not found");
  }
  if (!path.startsWith("/api/"))
    return env.ASSETS
      ? env.ASSETS.fetch(request)
      : new Response("Not found", { status: 404 });
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const origin = request.headers.get("Origin");
    const allowedOrigin = env.APP_ORIGIN ?? url.origin;
    if (
      origin &&
      origin !== allowedOrigin &&
      !(
        env.ENVIRONMENT === "local" &&
        ["http://127.0.0.1:5173", "http://localhost:5173"].includes(origin)
      )
    )
      throw new HttpError(403, "Request origin is not allowed");
  }
  const email = await authenticated(request, env);
  if (!email) throw new HttpError(401, "Sign in required");
  if (path === "/api/session" && method === "GET") return json({ email });
  if (path === "/api/species" && method === "GET") {
    const q = (url.searchParams.get("q") ?? "").slice(0, 100);
    const rows = await env.DB.prepare(
      "SELECT * FROM species WHERE common_name LIKE ? OR scientific_name LIKE ? ORDER BY common_name LIMIT 100",
    )
      .bind(`%${q}%`, `%${q}%`)
      .all<SpeciesRow>();
    return json(rows.results.map(species));
  }
  if (path === "/api/captures" && method === "POST") {
    const key = request.headers.get("Idempotency-Key");
    if (!key || key.length > 200)
      throw new HttpError(400, "Idempotency-Key is required");
    const previous = await env.DB.prepare(
      "SELECT * FROM captures WHERE idempotency_key=?",
    )
      .bind(key)
      .first<CaptureRow>();
    if (previous) return json(capture(previous));
    const form = await request.formData();
    const file = form.get("file"),
      kind = form.get("kind");
    if (!(file instanceof File) || !["image", "audio"].includes(String(kind)))
      throw new HttpError(400, "File and kind are required");
    if (file.size === 0 || file.size > 25 * 1024 * 1024)
      throw new HttpError(413, "Upload must be between 1 byte and 25 MiB");
    if (
      !(kind === "audio"
        ? [
            "audio/webm",
            "audio/mp4",
            "audio/mpeg",
            "audio/wav",
            "audio/x-wav",
            "audio/ogg",
            "audio/aac",
          ].includes(file.type.split(";")[0])
        : [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/heif",
          ].includes(file.type))
    )
      throw new HttpError(415, "Media type does not match capture");
    const m = form.get("metadata"),
      c = form.get("crop");
    const meta = m
      ? metadata(JSON.parse(String(m)))
      : { capturedAt: null, location: null, source: "missing" };
    const crop = c ? cropValue(JSON.parse(String(c))) : null;
    const id = crypto.randomUUID();
    await env.MEDIA.put(`originals/${id}`, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
    try {
      await env.DB.prepare(
        "INSERT INTO captures(id,kind,status,metadata,crop,created_at,media_type,idempotency_key) VALUES(?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          kind,
          "uploaded",
          JSON.stringify(meta),
          crop ? JSON.stringify(crop) : null,
          new Date().toISOString(),
          file.type,
          key,
        )
        .run();
    } catch (error) {
      await env.MEDIA.delete(`originals/${id}`);
      const winner = await env.DB.prepare(
        "SELECT * FROM captures WHERE idempotency_key=?",
      )
        .bind(key)
        .first<CaptureRow>();
      if (winner) return json(capture(winner));
      throw error;
    }
    return json(capture(await getCapture(env, id)), 201);
  }
  if (path === "/api/captures" && method === "GET") {
    await expireInterruptedCaptures(env);
    const rows = await env.DB.prepare(
      "SELECT * FROM captures ORDER BY created_at DESC",
    ).all<CaptureRow>();
    return json(rows.results.map(capture));
  }
  const match = path.match(
    /^\/api\/captures\/([^/]+)(?:\/(process|confirm))?$/,
  );
  if (match) {
    const id = match[1],
      action = match[2];
    await expireInterruptedCaptures(env);
    const row = await getCapture(env, id);
    if (!action && method === "GET") return json(capture(row));
    if (!action && method === "DELETE") {
      await removeCapture(env, id);
      ctx.waitUntil(renderFrame(env));
      return json({ ok: true });
    }
    if (!action && method === "PATCH") {
      const body = (await request.json()) as {
        metadata?: unknown;
        crop?: unknown;
      };
      const meta =
        body.metadata === undefined
          ? JSON.parse(row.metadata)
          : metadata(body.metadata);
      if (
        body.metadata !== undefined &&
        (meta.source !== "user" ||
          (meta.capturedAt && !/(Z|[+-]\d{2}:\d{2})$/.test(meta.capturedAt)))
      )
        throw new HttpError(
          400,
          "Save corrected dates with an explicit timezone and user source",
        );
      const crop =
        body.crop === undefined
          ? row.crop
          : JSON.stringify(cropValue(body.crop));
      if (row.status === "processing")
        throw new HttpError(409, "Wait for identification to finish");
      if (body.metadata !== undefined && (!meta.capturedAt || !meta.location)) {
        const linked = await env.DB.prepare(
          "SELECT id FROM sightings WHERE capture_id=? LIMIT 1",
        )
          .bind(id)
          .first();
        if (linked)
          throw new HttpError(
            422,
            "Confirmed captures need a date and location",
          );
      }
      const updates = [
        env.DB.prepare(
          "UPDATE captures SET metadata=?,crop=?,metadata_corrected=? WHERE id=?",
        ).bind(
          JSON.stringify(meta),
          crop,
          body.metadata === undefined ? row.metadata_corrected : 1,
          id,
        ),
      ];
      if (body.metadata !== undefined)
        updates.push(
          env.DB.prepare(
            "UPDATE sightings SET captured_at=?,location=? WHERE capture_id=?",
          ).bind(
            meta.capturedAt,
            meta.location ? JSON.stringify(meta.location) : null,
            id,
          ),
          env.DB.prepare("UPDATE frame SET dirty=dirty+1 WHERE id=1"),
        );
      await env.DB.batch(updates);
      if (body.metadata !== undefined) ctx.waitUntil(renderFrame(env));
      return json(capture(await getCapture(env, id)));
    }
    if (action === "process" && method === "POST") {
      if (row.status === "processing") return json(capture(row), 202);
      if (row.attempts >= 5)
        throw new HttpError(
          429,
          "Retry limit reached; correct manually or upload again",
        );
      const claim = await env.DB.prepare(
        "UPDATE captures SET status='processing',error=NULL,identification=NULL,attempts=attempts+1,processing_started_at=? WHERE id=? AND status!='processing' AND attempts<5",
      )
        .bind(new Date().toISOString(), id)
        .run();
      if (claim.meta.changes) await processCapture(env, id);
      return json(capture(await getCapture(env, id)), 202);
    }
    if (action === "confirm" && method === "POST") {
      const body = (await request.json()) as {
        speciesId?: unknown;
        identifiedBy?: unknown;
      };
      if (
        typeof body.speciesId !== "string" ||
        !["model", "user"].includes(String(body.identifiedBy))
      )
        throw new HttpError(
          400,
          "Species and identification source are required",
        );
      const sp = await env.DB.prepare("SELECT id FROM species WHERE id=?")
        .bind(body.speciesId)
        .first();
      if (!sp) throw new HttpError(400, "Unknown species");
      const meta = metadata(JSON.parse(row.metadata));
      if (!meta.capturedAt || !meta.location)
        throw new HttpError(
          422,
          "Set the capture date and location before confirmation",
        );
      const result: Identification | null = row.identification
        ? JSON.parse(row.identification)
        : null;
      if (
        result?.warnings.includes("embedded_date_has_no_timezone") &&
        !row.metadata_corrected
      )
        throw new HttpError(
          422,
          "Photo has no timezone: check and save the capture date and time before confirmation",
        );
      if (
        body.identifiedBy === "model" &&
        !result?.candidates.some((c) => c.speciesId === body.speciesId)
      )
        throw new HttpError(400, "Species is not a model candidate");
      const statements = [];
      if (row.kind === "image")
        statements.push(
          env.DB.prepare(
            "DELETE FROM sightings WHERE capture_id=? AND species_id!=?",
          ).bind(id, body.speciesId),
        );
      statements.push(
        env.DB.prepare(
          "INSERT INTO sightings(id,capture_id,species_id,identified_by,captured_at,location,created_at) SELECT ?,id,?,?,json_extract(metadata,'$.capturedAt'),json_extract(metadata,'$.location'),? FROM captures WHERE id=? ON CONFLICT(capture_id,species_id) DO UPDATE SET identified_by=excluded.identified_by,captured_at=excluded.captured_at,location=excluded.location",
        ).bind(
          crypto.randomUUID(),
          body.speciesId,
          body.identifiedBy,
          new Date().toISOString(),
          id,
        ),
        env.DB.prepare("UPDATE frame SET dirty=dirty+1 WHERE id=1"),
      );
      await env.DB.batch(statements);
      ctx.waitUntil(renderFrame(env));
      const saved = await env.DB.prepare(
        "SELECT * FROM sightings WHERE capture_id=? AND species_id=?",
      )
        .bind(id, body.speciesId)
        .first<SightingRow>();
      if (!saved) throw new Error("Sighting persistence failed");
      return json(sighting(saved));
    }
  }
  if (path.startsWith("/api/media/") && method === "GET") {
    const id = path.split("/")[3];
    await getCapture(env, id);
    const object = await env.MEDIA.get(`originals/${id}`);
    if (!object) throw new HttpError(404, "Media not found");
    return new Response(object.body, {
      headers: {
        "Content-Type":
          object.httpMetadata?.contentType ?? "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (path === "/api/sightings" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT * FROM sightings ORDER BY captured_at DESC",
    ).all<SightingRow>();
    return json(rows.results.map(sighting));
  }
  if (path === "/api/collection" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT DISTINCT species.* FROM species JOIN sightings ON sightings.species_id=species.id ORDER BY common_name",
    ).all<SpeciesRow>();
    const history = await env.DB.prepare(
      "SELECT * FROM sightings ORDER BY captured_at DESC",
    ).all<SightingRow>();
    return json(
      rows.results.map((r) => ({
        species: species(r),
        sightings: history.results
          .filter((s) => s.species_id === r.id)
          .map(sighting),
      })),
    );
  }
  if (path.startsWith("/api/sightings/") && method === "DELETE") {
    const id = path.split("/")[3];
    const row = await env.DB.prepare("SELECT * FROM sightings WHERE id=?")
      .bind(id)
      .first<SightingRow>();
    if (!row) throw new HttpError(404, "Sighting not found");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sightings WHERE id=?").bind(id),
      env.DB.prepare(
        "DELETE FROM captures WHERE id=? AND NOT EXISTS(SELECT 1 FROM sightings WHERE capture_id=?)",
      ).bind(row.capture_id, row.capture_id),
      env.DB.prepare("UPDATE frame SET dirty=dirty+1 WHERE id=1"),
    ]);
    const retained = await env.DB.prepare("SELECT id FROM captures WHERE id=?")
      .bind(row.capture_id)
      .first();
    if (!retained) await env.MEDIA.delete(`originals/${row.capture_id}`);
    ctx.waitUntil(renderFrame(env));
    return json({ ok: true });
  }
  if (path === "/api/frame" && method === "GET") return json(await state(env));
  if (path === "/api/frame" && method === "PUT") {
    const b = (await request.json()) as FrameSettings;
    if (
      !["week", "all-time", "manual"].includes(b.mode) ||
      typeof b.showNames !== "boolean" ||
      !Array.isArray(b.speciesIds) ||
      b.speciesIds.length > 6 ||
      b.speciesIds.some((id) => typeof id !== "string") ||
      new Set(b.speciesIds).size !== b.speciesIds.length
    )
      throw new HttpError(400, "Invalid frame settings");
    for (const id of b.speciesIds) {
      const known = await env.DB.prepare(
        "SELECT id FROM sightings WHERE species_id=? LIMIT 1",
      )
        .bind(id)
        .first();
      if (!known)
        throw new HttpError(400, "Manual birds must be in the collection");
    }
    await env.DB.prepare("UPDATE frame SET settings=?,dirty=dirty+1 WHERE id=1")
      .bind(JSON.stringify(b))
      .run();
    ctx.waitUntil(renderFrame(env));
    return json(await state(env));
  }
  if (path === "/api/frame/preview" && method === "GET") {
    const f = await state(env);
    if (!f.revision) throw new HttpError(404, "Frame image is not ready");
    return image(env, f.revision);
  }
  throw new HttpError(404, "Not found");
}
async function image(env: Env, revision: string) {
  const object = await env.MEDIA.get(`frames/${revision}.png`);
  if (!object) throw new HttpError(404, "Image not found");
  return new Response(object.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
    },
  });
}
export async function renderFrame(env: Env) {
  try {
    const row = await env.DB.prepare(
      "SELECT * FROM frame WHERE id=1",
    ).first<FrameRow>();
    if (!row) return;
    const settings: FrameSettings = JSON.parse(row.settings);
    const speciesRows = await env.DB.prepare(
      "SELECT DISTINCT species.* FROM species JOIN sightings ON sightings.species_id=species.id ORDER BY common_name",
    ).all<SpeciesRow>();
    const sightings = await env.DB.prepare(
      "SELECT * FROM sightings ORDER BY captured_at DESC",
    ).all<SightingRow>();
    const selected = selectSpecies(
      speciesRows.results.map((r) => ({
        species: species(r),
        sightings: sightings.results
          .filter((s) => s.species_id === r.id)
          .map(sighting),
      })),
      settings,
      new Date(),
    );
    const validManual = settings.speciesIds.filter((id) =>
      speciesRows.results.some((r) => r.id === id),
    );
    if (validManual.length !== settings.speciesIds.length) {
      settings.speciesIds = validManual;
      await env.DB.prepare("UPDATE frame SET settings=? WHERE id=1")
        .bind(JSON.stringify(settings))
        .run();
    }
    const content = JSON.stringify({
      species: selected,
      showNames: settings.showNames,
      width: 480,
      height: 800,
    });
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(content),
    );
    const revision = Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    if (revision === row.revision) {
      return;
    }
    const response = await serviceRequest(env, "renderer", "/render", {
      method: "POST",
      signal: AbortSignal.timeout(120000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RENDERER_TOKEN ?? ""}`,
      },
      body: content,
    });
    if (!response.ok) throw new Error(`Renderer failed (${response.status})`);
    const bytes = await response.arrayBuffer();
    const signature = new Uint8Array(bytes.slice(0, 8));
    if (signature.join(",") !== "137,80,78,71,13,10,26,10")
      throw new Error("Renderer returned an invalid PNG");
    await env.MEDIA.put(`frames/${revision}.png`, bytes, {
      httpMetadata: { contentType: "image/png" },
    });
    await env.DB.prepare(
      "UPDATE frame SET revision=?,error=NULL WHERE id=1 AND dirty=?",
    )
      .bind(revision, row.dirty)
      .run();
  } catch (error) {
    await env.DB.prepare("UPDATE frame SET error=? WHERE id=1")
      .bind(error instanceof Error ? error.message : "Frame update failed")
      .run();
  }
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      return await route(request, env, ctx);
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status);
      if (error instanceof SyntaxError)
        return json({ error: "Invalid JSON" }, 400);
      console.error(error);
      return json({ error: "Request failed" }, 500);
    }
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const pending = await env.DB.prepare(
      "SELECT id FROM captures WHERE status='processing' AND attempts<5 AND processing_started_at < ?",
    )
      .bind(new Date(Date.now() - 300000).toISOString())
      .all<{ id: string }>();
    for (const row of pending.results) {
      const claim = await env.DB.prepare(
        "UPDATE captures SET attempts=attempts+1,processing_started_at=? WHERE id=? AND status='processing' AND attempts<5 AND processing_started_at < ?",
      )
        .bind(
          new Date().toISOString(),
          row.id,
          new Date(Date.now() - 300000).toISOString(),
        )
        .run();
      if (claim.meta.changes) ctx.waitUntil(processCapture(env, row.id));
    }
    await env.DB.prepare(
      "UPDATE captures SET status='failed',error='Processing timed out; retry limit reached' WHERE status='processing' AND attempts>=5 AND processing_started_at < ?",
    )
      .bind(new Date(Date.now() - 300000).toISOString())
      .run();
    ctx.waitUntil(renderFrame(env));
  },
};
