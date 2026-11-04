import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import worker, { renderFrame, type Env } from "./index";
import { DEMO_SPECIES } from "../renderer/schedule";

const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: "pairing",
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: "2025-09-01",
    d1Databases: ["DB"],
    r2Buckets: ["MEDIA"],
  }),
);
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
let env: Env;
let rendered: Record<string, unknown>[];
const tasks: Promise<unknown>[] = [];
const ctx = {
  waitUntil(p: Promise<unknown>) {
    tasks.push(p);
  },
  passThroughOnException() {},
  props: {},
} as ExecutionContext;
const call = (path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`https://birds.test${path}`, init), env, ctx);
const post = (path: string, body?: unknown, cookie?: string) =>
  call(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const session = (cookie: string) => call("/api/session", { headers: { Cookie: cookie } });
async function frameContent() {
  await Promise.all(tasks.splice(0));
  await renderFrame(env);
  return rendered.at(-1);
}
async function frameToken(): Promise<string> {
  const content = await frameContent();
  const url = String(content?.pairingUrl);
  expect(url.startsWith("https://birds.test/#pair=")).toBe(true);
  return url.slice(url.indexOf("#pair=") + 6);
}
async function pairCookie(token: string): Promise<string> {
  const response = await post("/api/pair", { token });
  expect(response.status).toBe(204);
  const header = response.headers.get("Set-Cookie") ?? "";
  expect(header).toMatch(/HttpOnly/);
  expect(header).toMatch(/Secure/);
  expect(header).toMatch(/Max-Age=31536000/);
  return header.split(";")[0];
}

beforeEach(async () => {
  rendered = [];
  const db = await mf.getD1Database("DB");
  await db.exec("DROP TABLE IF EXISTS frame; DROP TABLE IF EXISTS auth;");
  for (const file of ["0001_initial.sql", "0007_pairing.sql"])
    for (const statement of (await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"))
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("--")))
      await db.exec(statement.replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS "));
  await db.exec("DELETE FROM sightings; DELETE FROM captures;");
  env = {
    DB: db,
    MEDIA: (await mf.getR2Bucket("MEDIA")) as unknown as R2Bucket,
    ENVIRONMENT: "production",
    APP_ORIGIN: "https://birds.test",
    RENDERER: {
      getByName: () => ({
        async fetch(request: Request) {
          rendered.push(await request.json());
          return new Response(PNG);
        },
      }),
    },
  };
});
afterEach(() => vi.useRealTimers());

describe("QR pairing and phone sessions", () => {
  it("shows a QR until a phone pairs, then the birds; the code works once", async () => {
    expect((await call("/api/session")).status).toBe(401);
    const token = await frameToken();
    const cookie = await pairCookie(token);
    expect(await (await session(cookie)).json()).toEqual({ signedIn: true });
    expect(await frameContent()).toMatchObject({ species: [], width: 480 });
    expect((await post("/api/pair", { token })).status).toBe(401);
  });

  it("replaces an expired code while unpaired, at most hourly", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T09:00:00Z"));
    const first = await frameToken();
    vi.setSystemTime(new Date("2026-11-07T09:59:00Z"));
    expect(await frameToken()).toBe(first);
    vi.setSystemTime(new Date("2026-11-07T10:01:00Z"));
    expect((await post("/api/pair", { token: first })).status).toBe(401);
    expect(await frameToken()).not.toBe(first);
  });

  it("rejects forged cookies, refreshes month-old ones and expires year-old ones", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const cookie = await pairCookie(await frameToken());
    const [name, value] = cookie.split("=");
    const [version, issued, signature] = value.split(".");
    expect((await session(`${name}=${version}.${Number(issued) + 1}.${signature}`)).status).toBe(401);
    expect((await session(`${name}=${version}.${issued}.AAAA`)).status).toBe(401);
    expect((await session(`other=1; ${cookie}`)).headers.get("Set-Cookie")).toBeNull();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    expect((await session(cookie)).headers.get("Set-Cookie")).toMatch(/^av_session=v1\./);
    vi.setSystemTime(new Date("2027-01-02T00:00:00Z"));
    expect((await session(cookie)).status).toBe(401);
  });

  it("adds a second phone without signing out the first", async () => {
    const first = await pairCookie(await frameToken());
    const added = await post("/api/pairing", undefined, first);
    const { url } = (await added.json()) as { url: string };
    expect((await frameContent())?.pairingUrl).toBe(url);
    const second = await pairCookie(url.slice(url.indexOf("#pair=") + 6));
    expect((await session(first)).status).toBe(200);
    expect((await session(second)).status).toBe(200);
    expect(await frameContent()).toMatchObject({ species: [] });
    expect((await post("/api/pairing")).status).toBe(401);
  });

  it("signs every phone out and shows a fresh QR after a lost phone", async () => {
    const cookie = await pairCookie(await frameToken());
    const reset = await post("/api/pairing/reset", undefined, cookie);
    expect(reset.status).toBe(204);
    expect(reset.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
    expect((await session(cookie)).status).toBe(401);
    await frameToken();
  });

  it("demo mode previews a full frame of catalogue birds without touching the collection", async () => {
    const cookie = await pairCookie(await frameToken());
    await env.DB.exec("DELETE FROM species;");
    for (const id of DEMO_SPECIES)
      await env.DB.prepare("INSERT INTO species VALUES(?,?,?,?)").bind(id, id, id, `/birds/${id}.png`).run();
    const put = await call("/api/frame", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "https://birds.test" },
      body: JSON.stringify({ mode: "demo", speciesIds: [], showNames: true }),
    });
    expect(put.status).toBe(200);
    const content = await frameContent();
    expect(content).toMatchObject({ demo: true, showNames: true });
    expect((content?.species as { id: string }[]).map((s) => s.id)).toEqual(DEMO_SPECIES);
    const counts = await env.DB.prepare("SELECT (SELECT count(*) FROM sightings) AS s, (SELECT count(*) FROM captures) AS c").first();
    expect(counts).toEqual({ s: 0, c: 0 });
  });
});
