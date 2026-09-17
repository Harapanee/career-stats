/** G2 出典死活: 取得元 URL・利用規約 URL が HTTP 2xx/3xx で応答することを検査する。 */
import { result, type FetchLike, type Gate } from "./types.js";

export interface ProbeResult {
  ok: boolean;
  status: number;
  error?: string;
}

const isOk = (status: number) => status >= 200 && status < 400;

/** HEAD で確認し、405/403 なら GET にフォールバック。ネットワーク例外は error に入れて返す */
export async function probeUrl(url: string, fetchFn: FetchLike = globalThis.fetch): Promise<ProbeResult> {
  try {
    let res = await fetchFn(url, { method: "HEAD", redirect: "follow" });
    if (res.status === 405 || res.status === 403) res = await fetchFn(url, { method: "GET", redirect: "follow" });
    return { ok: isOk(res.status), status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 複数 URL をまとめて検査し、失敗した URL の説明文を返す */
export async function probeAll(urls: Iterable<string>, fetchFn?: FetchLike): Promise<string[]> {
  const out: string[] = [];
  for (const url of new Set(urls)) {
    const r = await probeUrl(url, fetchFn);
    if (!r.ok) out.push(r.error ? `${url}: 接続エラー(${r.error})` : `${url}: HTTP ${r.status}`);
  }
  return out;
}

export function sourceLivenessGate(urls: string[], deps: { fetch?: FetchLike } = {}): Gate {
  return {
    id: "G2",
    name: "出典死活",
    run: async () => result(await probeAll(urls, deps.fetch)),
  };
}
