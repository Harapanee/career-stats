import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_USER_AGENT,
  fetchFile,
  fetchJson,
  headOk,
  sha256Hex,
  type FetchLike,
} from "../../src/sources/http.js";

const URL_ = "https://example.test/data.json";
const noSleep = async () => {};

function res(status: number, body = "", type = "text/plain"): Response {
  return new Response(status === 204 ? null : body, {
    status,
    headers: { "content-type": type },
  });
}

describe("sha256Hex", () => {
  it("matches node:crypto", () => {
    const bytes = new TextEncoder().encode("hello");
    const expected = createHash("sha256").update(bytes).digest("hex");
    expect(sha256Hex(bytes)).toBe(expected);
  });
});

describe("fetchFile", () => {
  it("returns bytes, sha256, contentType on 200", async () => {
    const body = '{"a":1}';
    const fetch: FetchLike = vi.fn(async () => res(200, body, "application/json"));
    const f = await fetchFile(URL_, { fetch, sleep: noSleep });
    expect(f.url).toBe(URL_);
    expect(new TextDecoder().decode(f.bytes)).toBe(body);
    expect(f.sha256).toBe(createHash("sha256").update(body).digest("hex"));
    expect(f.contentType).toBe("application/json");
    expect(Date.parse(f.fetchedAt)).not.toBeNaN();
  });

  it("retries after 500 and succeeds on 200", async () => {
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(res(500, "err"))
      .mockResolvedValueOnce(res(200, "ok"));
    const sleep = vi.fn(async () => {});
    const f = await fetchFile(URL_, { fetch, sleep });
    expect(new TextDecoder().decode(f.bytes)).toBe("ok");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("throws after retries+1 attempts when always 500", async () => {
    const fetch = vi.fn<FetchLike>(async () => res(500, "err"));
    await expect(fetchFile(URL_, { fetch, retries: 2, sleep: noSleep })).rejects.toThrow(/500.*example\.test/);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("sends the User-Agent header", async () => {
    const fetch = vi.fn<FetchLike>(async () => res(200, "ok"));
    await fetchFile(URL_, { fetch, sleep: noSleep });
    const init = fetch.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("user-agent")).toBe(DEFAULT_USER_AGENT);
    expect(DEFAULT_USER_AGENT).toMatch(/^career-stats-bot\/1\.0 \(\+https:\/\//);
  });
});

describe("fetchJson", () => {
  it("parses JSON and returns the file", async () => {
    const fetch: FetchLike = async () => res(200, '{"x":[1,2]}', "application/json");
    const { data, file } = await fetchJson<{ x: number[] }>(URL_, { fetch, sleep: noSleep });
    expect(data.x).toEqual([1, 2]);
    expect(file.sha256).toHaveLength(64);
  });
});

describe("headOk", () => {
  it("uses HEAD when allowed", async () => {
    const fetch = vi.fn<FetchLike>(async () => res(200));
    expect(await headOk(URL_, { fetch })).toEqual({ ok: true, status: 200 });
    expect(fetch.mock.calls[0]?.[1]?.method).toBe("HEAD");
  });

  it("falls back to GET on 405", async () => {
    const fetch = vi.fn<FetchLike>(async (_u, init) =>
      init?.method === "HEAD" ? res(405) : res(200, "ok"),
    );
    expect(await headOk(URL_, { fetch })).toEqual({ ok: true, status: 200 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[1]?.method).toBe("GET");
  });

  it("never throws on network error", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("ECONNRESET");
    };
    expect(await headOk(URL_, { fetch })).toEqual({ ok: false, status: 0 });
  });
});
