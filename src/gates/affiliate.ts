/** G4 収益リンク: ASP URL が active な allowlist と完全一致し、リンク先が生きていることを検査する。 */
import type { BuiltPage } from "../render/types.js";
import type { Monetization } from "../monetize/types.js";
import { extractAnchors, result, type FetchLike, type Gate } from "./types.js";
import { probeAll } from "./liveness.js";

export const ASP_URL_RE = /a8\.net|valuecommerce|accesstrade|afi-b|felmat|moshimo/i;

export interface AffiliateGateDeps {
  fetch?: FetchLike;
  /** 既定 true。false で HEAD/GET をスキップ(--offline 用) */
  checkLiveness?: boolean;
}

export function affiliateGate(pages: BuiltPage[], m: Monetization, deps: AffiliateGateDeps = {}): Gate {
  const activeUrls = new Set(m.programs.filter((p) => p.status === "active").map((p) => p.url));
  return {
    id: "G4",
    name: "収益リンク",
    run: async () => {
      const out: string[] = [];
      for (const page of pages) {
        const hrefs = extractAnchors(page.html).map((a) => a.href);
        for (const href of hrefs)
          if (ASP_URL_RE.test(href) && !activeUrls.has(href)) out.push(`${page.path}: active でないアフィリエイト URL ${href}`);
        const usesActive = hrefs.some((h) => activeUrls.has(h));
        if (page.hasAffiliate && !usesActive) out.push(`${page.path}: hasAffiliate=true だが active なアフィリエイト URL がない`);
        if (!page.hasAffiliate && usesActive) out.push(`${page.path}: active なアフィリエイト URL を含むが hasAffiliate=false`);
      }
      if (deps.checkLiveness ?? true) out.push(...(await probeAll(activeUrls, deps.fetch)).map((s) => `リンク先 ${s}`));
      return result(out);
    },
  };
}
