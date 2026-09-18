/**
 * HTTP 取得ユーティリティ。ネットワークは `fetch` を注入してテストする。
 * 非 2xx は `retries` 回まで再試行(既定 2 回、待ち 500ms)し、それでも失敗したら throw。
 */
import { createHash } from "node:crypto";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface FetchedFile {
  url: string;
  bytes: Uint8Array;
  sha256: string;
  contentType: string;
  /** ISO 8601 */
  fetchedAt: string;
}

export interface HttpOpts {
  fetch?: FetchLike;
  /** 再試行回数(既定 2 = 最大 3 回試行) */
  retries?: number;
  timeoutMs?: number;
  userAgent?: string;
  /** 再試行の待ち(テストで差し替える) */
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_USER_AGENT =
  "career-stats-bot/1.0 (+https://career.harateck.com; k.hara@harateck.com)";

const RETRY_WAIT_MS = 500;
const DEFAULT_TIMEOUT_MS = 30_000;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function resolve(opts: HttpOpts | undefined) {
  return {
    fetch: opts?.fetch ?? (globalThis.fetch as FetchLike),
    retries: opts?.retries ?? 2,
    timeoutMs: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    userAgent: opts?.userAgent ?? DEFAULT_USER_AGENT,
    sleep: opts?.sleep ?? defaultSleep,
  };
}

function request(
  fetch: FetchLike,
  url: string,
  method: "GET" | "HEAD",
  userAgent: string,
  timeoutMs: number,
): Promise<Response> {
  return fetch(url, {
    method,
    headers: { "User-Agent": userAgent },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function fetchFile(url: string, opts?: HttpOpts): Promise<FetchedFile> {
  const o = resolve(opts);
  let lastError: unknown;
  for (let attempt = 0; attempt <= o.retries; attempt++) {
    if (attempt > 0) await o.sleep(RETRY_WAIT_MS);
    try {
      const res = await request(o.fetch, url, "GET", o.userAgent, o.timeoutMs);
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} for ${url}`);
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      return {
        url,
        bytes,
        sha256: sha256Hex(bytes),
        contentType: res.headers.get("content-type") ?? "",
        fetchedAt: new Date().toISOString(),
      };
    } catch (e) {
      lastError = e;
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`fetchFile failed after ${o.retries + 1} attempts: ${reason} (${url})`);
}

export async function fetchJson<T = unknown>(
  url: string,
  opts?: HttpOpts,
): Promise<{ data: T; file: FetchedFile }> {
  const file = await fetchFile(url, opts);
  const data = JSON.parse(new TextDecoder("utf-8").decode(file.bytes)) as T;
  return { data, file };
}

/** 死活監視用。HEAD が 405/403 なら GET にフォールバック。決して throw しない。 */
export async function headOk(url: string, opts?: HttpOpts): Promise<{ ok: boolean; status: number }> {
  const o = resolve(opts);
  try {
    let res = await request(o.fetch, url, "HEAD", o.userAgent, o.timeoutMs);
    if (res.status === 405 || res.status === 403) {
      res = await request(o.fetch, url, "GET", o.userAgent, o.timeoutMs);
    }
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
