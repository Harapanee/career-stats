/**
 * 収益 CTA(アフィリエイト広告枠)。
 * - config/monetization.json の status: "active" なプログラムだけを対象にする
 * - ASP 発行 URL は改変しない(属性エスケープのみ)
 * - rel="sponsored nofollow noopener" と PR 表記を必ず付ける
 */
import { readFile } from "node:fs/promises";
import type { RegionCode } from "../normalize/types.js";
import { escapeXml } from "../render/svg.js";
import type { Monetization, Program, ProgramStatus } from "./types.js";

const STATUSES: ReadonlyArray<ProgramStatus> = ["active", "pending", "retired"];
const DEFAULT_HEADING = "関連サービス(広告)";
const NOTE = "掲載順は固定です。広告掲載はサイト運営費に充てられ、統計データの内容には影響しません。";

/** active かつ文脈一致かつ(対象地域が空 or 指定地域を含む)。順序は設定ファイルの順のまま */
export function selectPrograms(m: Monetization, ctx: { context: string; region?: RegionCode }): Program[] {
  return m.programs.filter(
    (p) =>
      p.status === "active" &&
      p.contexts.includes(ctx.context) &&
      (p.targetRegions.length === 0 || (ctx.region !== undefined && p.targetRegions.includes(ctx.region))),
  );
}

function renderCard(p: Program): string {
  return (
    '<div class="cta-card">' +
    '<span class="pr-label">PR</span>' +
    `<p class="cta-name">${escapeXml(p.name)}(広告主: ${escapeXml(p.advertiser)})</p>` +
    `<p>${escapeXml(p.targetAudience)} 向け</p>` +
    `<a class="cta-button" href="${escapeXml(p.url)}" rel="sponsored nofollow noopener" target="_blank">${escapeXml(p.cta)}</a>` +
    "</div>"
  );
}

/** 空配列なら ""。それ以外は <aside class="cta"> ブロック */
export function renderCta(programs: Program[], opts: { heading?: string } = {}): string {
  if (programs.length === 0) return "";
  return (
    '<aside class="cta" aria-label="広告">' +
    `<h2>${escapeXml(opts.heading ?? DEFAULT_HEADING)}</h2>` +
    programs.map(renderCard).join("") +
    `<p class="cta-note">${NOTE}</p>` +
    "</aside>"
  );
}

/** いずれかのプログラム URL(空でないもの)が html に含まれていれば true */
export function containsAffiliate(html: string, m: Monetization): boolean {
  return m.programs.some((p) => p.url !== "" && (html.includes(p.url) || html.includes(escapeXml(p.url))));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateProgram(p: unknown, i: number): asserts p is Program {
  if (!isRecord(p)) throw new Error(`monetization: programs[${i}] is not an object`);
  const id = typeof p.id === "string" ? p.id : String(i);
  if (!STATUSES.includes(p.status as ProgramStatus))
    throw new Error(`monetization: program "${id}" has invalid status "${String(p.status)}"`);
  for (const k of ["name", "advertiser", "cta", "url"] as const)
    if (typeof p[k] !== "string") throw new Error(`monetization: program "${id}" field "${k}" must be a string`);
  for (const k of ["targetRegions", "contexts"] as const)
    if (!Array.isArray(p[k])) throw new Error(`monetization: program "${id}" field "${k}" must be an array`);
  if (p.status === "active" && !/^https:\/\/\S+$/.test(p.url as string))
    throw new Error(`monetization: active program "${id}" must have a non-empty https url`);
}

/** JSON を読み込んで検証する。active なのに https URL が無い場合は throw */
export async function loadMonetization(path: string): Promise<Monetization> {
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(raw) || !Array.isArray(raw.programs)) throw new Error(`monetization: "programs" must be an array (${path})`);
  if (typeof raw.disclosure !== "string" || raw.disclosure === "")
    throw new Error(`monetization: "disclosure" must be a non-empty string (${path})`);
  raw.programs.forEach((p, i) => validateProgram(p, i));
  return raw as unknown as Monetization;
}
