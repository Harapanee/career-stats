import { describe, it, expect } from "vitest";
import { sourceLivenessGate, probeUrl } from "../../src/gates/liveness.js";
import type { FetchLike } from "../../src/gates/types.js";

function fakeFetch(table: Record<string, number | ((method: string) => number | Error)>, calls: string[] = []): FetchLike {
  return async (url, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push(`${method} ${url}`);
    const v = table[url];
    if (v === undefined) throw new TypeError(`fetch failed: ${url}`);
    const status = typeof v === "function" ? v(method) : v;
    if (status instanceof Error) throw status;
    return new Response(null, { status });
  };
}

describe("G2 sourceLivenessGate", () => {
  it("PASS: all urls 2xx/3xx via HEAD, deduped", async () => {
    const calls: string[] = [];
    const f = fakeFetch({ "https://a.test/x": 200, "https://b.test/y": 301 }, calls);
    const g = sourceLivenessGate(["https://a.test/x", "https://b.test/y", "https://a.test/x"], { fetch: f });
    expect(g.id).toBe("G2");
    expect(g.name).toBe("出典死活");
    const r = await g.run();
    expect(r.status).toBe("PASS");
    expect(calls.filter((c) => c.includes("a.test")).length).toBe(1);
    expect(calls.every((c) => c.startsWith("HEAD "))).toBe(true);
  });

  it("PASS: HEAD 405 falls back to GET", async () => {
    const calls: string[] = [];
    const f = fakeFetch({ "https://a.test/x": (m) => (m === "HEAD" ? 405 : 200) }, calls);
    const r = await sourceLivenessGate(["https://a.test/x"], { fetch: f }).run();
    expect(r.status).toBe("PASS");
    expect(calls).toEqual(["HEAD https://a.test/x", "GET https://a.test/x"]);
  });

  it("FAIL: non-2xx/3xx lists url and status", async () => {
    const f = fakeFetch({ "https://a.test/x": 200, "https://b.test/y": 404 });
    const r = await sourceLivenessGate(["https://a.test/x", "https://b.test/y"], { fetch: f }).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]).toContain("https://b.test/y");
    expect(r.messages[0]).toContain("404");
  });

  it("FAIL: network error", async () => {
    const f = fakeFetch({});
    const r = await sourceLivenessGate(["https://down.test/"], { fetch: f }).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages[0]).toContain("https://down.test/");
    expect(r.messages[0]).toContain("fetch failed");
  });

  it("probeUrl reports status", async () => {
    const f = fakeFetch({ "https://a.test/x": 503 });
    expect(await probeUrl("https://a.test/x", f)).toEqual({ ok: false, status: 503 });
  });
});
