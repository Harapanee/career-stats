# 就職・転職 統計メディア Phase 1 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 厚労省「一般職業紹介状況」の都道府県別 有効求人倍率を毎週自動取得し、ゲート検査を通ったときだけ静的サイトを GitHub Pages に公開する 1 サイクルを、GitHub Actions の cron で自動運用開始する。

**Architecture:** `collect`(取得・正規化 JSON をコミット)→ `check`(ゲート。FAIL なら終了コード 1)→ `build`(HTML/SVG を `site/` に生成)→ Actions が Pages にデプロイ。すべて純粋関数中心の TypeScript で、ネットワークは `fetch` 注入でテストする。

**Tech Stack:** Node 22+ / TypeScript strict / vitest / eslint / 依存ライブラリは Excel パーサ(`exceljs`)のみ / GitHub Pages + Actions。

**Spec:** `docs/superpowers/specs/2026-09-18-career-stats-media-design.md`(§4 法令ルール L1〜L13、§5 ゲート G1〜G6 を実装する)

## Global Constraints

- 生成 AI による自由記述は使わない。文章はデータから決定的に導出する(spec §1.2)。
- 総ページ数 ≤ 300(`config/site.json` の `maxPages`)。
- 1 指標×1 地域=1 URL。URL はディレクトリ形式(`/pref/tokyo/`)。
- アフィリエイトリンクは `config/monetization.json` の `status: "active"` のものだけ。`rel="sponsored nofollow noopener"` 必須。PR 表記の文言は `disclosure` を使う。
- 出典表記の文言: 「出典:『一般職業紹介状況』(厚生労働省)(URL)(YYYY-MM-DD 取得)を加工して作成(harateck)」。
- 禁止語彙(G3): No.1 / 1位のエージェント / おすすめ度 / 満足度 / 必ず / 絶対 / 業界最高 / 報酬 / 成果条件 / 確定率 / 応募する / 求人詳細 / 求人番号 / 募集中 / 採用情報。
- テスト: `npm test`、lint: `npm run lint` が終了コード 0。コミットは main エージェントが行う。
- 既存モジュール(完成済み): `src/render/svg.ts`(renderLineChart/renderBarChart/escapeXml/formatNumber)、`src/render/sitemap.ts`(renderSitemap/renderRobots/joinUrl)、`src/render/page.ts`(renderPage/SiteConfig/PageSpec/SourceRef)、`src/gates/run.ts`(runGates/Gate/GateResult)、`src/normalize/types.ts`(MetricId/RegionCode/Observation/Dataset/PREFECTURES/prefectureByName)。

---

### Task 1: HTTP 取得ユーティリティ(`src/sources/http.ts`)

**Files:** Create `src/sources/http.ts`, Test `tests/sources/http.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
  export interface FetchedFile { url: string; bytes: Uint8Array; sha256: string; contentType: string; fetchedAt: string }
  export async function fetchFile(url: string, opts?: { fetch?: FetchLike; retries?: number; timeoutMs?: number; userAgent?: string }): Promise<FetchedFile>
  export async function headOk(url: string, opts?: { fetch?: FetchLike }): Promise<{ ok: boolean; status: number }>
  export function sha256Hex(bytes: Uint8Array): string
  ```
- 仕様: 非 2xx は 1 回まで再試行(既定 retries=2、待ち 500ms)後に throw。`User-Agent` は `career-stats-bot/1.0 (+baseUrl; contact email)`。`headOk` は HEAD が 405 のとき GET にフォールバック。

- [ ] テスト: 200 で sha256 が計算される / 500→200 で再試行成功 / 3 回失敗で throw / headOk が 405→GET フォールバック / User-Agent ヘッダが付く
- [ ] 実装 → テスト PASS → lint PASS

### Task 2: 一般職業紹介状況アダプタ(`src/sources/mhlw-openings.ts`)

**Files:** Create `src/sources/mhlw-openings.ts`, `tests/sources/mhlw-openings.test.ts`, `tests/fixtures/mhlw-openings/*`(実ファイルの小さな抜粋)

**Interfaces:**
- Consumes: `fetchFile` (Task 1)、`Dataset`/`Observation`/`prefectureByName` (types)
- Produces:
  ```ts
  export const MHLW_OPENINGS_SOURCE: { name: string; url: string; termsUrl: string; listingUrl: string };
  export function parsePrefectureRatios(bytes: Uint8Array, opts: { format: "xlsx" | "csv" }): Observation[]  // metric=active_openings_ratio, region=01..47 と JP, period=YYYY-MM
  export async function collectMhlwOpenings(deps: { fetch?: FetchLike; now?: () => Date }): Promise<Dataset>
  ```
- 取得 URL・形式・列構造は `docs/data-sources.md` に記録した確認結果に従う(本タスク着手時に同ファイルを読むこと)。
- パーサ要件: 都道府県名の表記揺れ(全角空白・「県」有無)を `prefectureByName` で吸収 / 和暦・西暦の期間表記を `YYYY-MM` に正規化 / 数値でないセルは無視 / 47 都道府県が揃わなければ throw。

- [ ] fixture を作る(実ファイルから該当シートの先頭〜数行+47 行を抜粋)
- [ ] テスト: fixture から 47 都道府県×N 期間の Observation が出る / 期間が `YYYY-MM` / 東京都の既知の値と一致 / 欠損セルを無視 / 46 都道府県しか無い fixture で throw
- [ ] 実装 → PASS → lint PASS

### Task 3: 正規化ストア(`src/normalize/store.ts`)

**Files:** Create `src/normalize/store.ts`, Test `tests/normalize/store.test.ts`

**Interfaces:**
```ts
export interface Store { datasets: Record<MetricId, Dataset | undefined> }
export function mergeDataset(existing: Dataset | undefined, incoming: Dataset): Dataset   // observations を (region, period) キーで上書きマージし period 昇順に整列。sourceUrl/fetchedAt/rawSha256 は incoming を採用
export function latestPeriod(ds: Dataset): string | undefined
export function seriesFor(ds: Dataset, region: RegionCode): { period: string; value: number }[]  // 昇順
export async function readStore(dir: string): Promise<Store>     // data/normalized/<metric>.json を読む。無ければ空
export async function writeStore(dir: string, store: Store): Promise<void>  // JSON を整形して書く(決定的な順序)
```
- [ ] テスト: merge が重複を上書きし昇順になる / latestPeriod / seriesFor / read→write→read の往復が同一 / 空ディレクトリで空 Store
- [ ] 実装 → PASS → lint

### Task 4: 派生値(`src/normalize/derive.ts`)

**Interfaces:**
```ts
export interface DerivedStats {
  region: RegionCode; period: string; value: number;
  momDiff: number | null;    // 前月差
  yoyDiff: number | null;    // 前年同月差
  rank: number | null;       // 全国順位(47 都道府県中、値が大きいほど上位、同値は同順位)
  rankOf: number;            // 47
  maxInSeries: { period: string; value: number };
  minInSeries: { period: string; value: number };
  trend3m: "up" | "down" | "flat";   // 直近 3 か月の単純比較(差の絶対値 < 0.01 は flat)
  nationalDiff: number | null;       // 全国値との差
}
export function derive(ds: Dataset, region: RegionCode, period?: string): DerivedStats
export function rankTable(ds: Dataset, period: string): { region: RegionCode; value: number; rank: number }[]  // 47 件、降順
```
- [ ] テスト(小さな手作り Dataset で): momDiff/yoyDiff/rank(同値の扱い)/max/min/trend/nationalDiff/期間不足時 null
- [ ] 実装 → PASS → lint

### Task 5: 文章生成(`src/render/text.ts`)

決定的なテンプレート文。ページ固有の特徴(過去最高/最低更新、3 か月トレンド、全国順位帯、前年比の向き)で分岐し、都道府県間で本文が同一にならないようにする。
```ts
export function summarySentences(d: DerivedStats, names: { region: string; metric: string; unit: string }): string[]  // 3〜6 文
export function periodLabel(period: string): string   // "2026-07" → "2026年7月"
```
- [ ] テスト: 前月差が正/負/ゼロで文が変わる / 過去最高更新時に「過去最高」を含む / 禁止語彙を含まない / 同じ入力→同じ出力
- [ ] 実装 → PASS → lint

### Task 6: 収益 CTA(`src/monetize/cta.ts`)

```ts
export interface Program { id: string; name: string; advertiser: string; asp: string; aspProgramId: string; status: "active" | "pending" | "retired"; url: string; targetAudience: string; targetRegions: string[]; contexts: string[]; cta: string; note?: string }
export interface Monetization { disclosure: string; programs: Program[]; paidData: { status: string; stripePaymentLinkUrl: string } }
export function selectPrograms(m: Monetization, ctx: { context: string; region?: RegionCode }): Program[]  // active かつ context 一致かつ (targetRegions が空 or region を含む)
export function renderCta(programs: Program[]): string   // 空なら ""。各カードに <span class="pr-label">PR</span>、<a href=url rel="sponsored nofollow noopener" target="_blank">、advertiser 表記
export function loadMonetization(path: string): Promise<Monetization>
```
- [ ] テスト: pending は選ばれない / 地域外は選ばれない / rel 属性 / PR ラベル / 空配列で "" / URL 改変なし
- [ ] 実装 → PASS → lint

### Task 7: ページビルダー(`src/render/pages.ts`)

```ts
export interface BuildInput { site: SiteConfig; monetization: Monetization; store: Store; today: string /* YYYY-MM-DD */ }
export interface BuiltPage { path: string; html: string; lastmod: string; hasAffiliate: boolean }
export function buildAllPages(input: BuildInput): BuiltPage[]
```
ページ: `/`(全国の最新値・折れ線・上位/下位 5 県・全都道府県への導線)、`/pref/`(47 県の横棒ランキング表。キャプションに出典・時点・並べ替え基準)、`/pref/<slug>/`(折れ線・派生値の表・summarySentences・隣接順位の県へのリンク・新卒 CTA は `context: "new-graduate"` かつ対象地域のみ)、`/metrics/`、`/metrics/active-openings-ratio/`(全国の長期系列と解説)、`/about/`(編集方針: 自動生成・自動更新の開示、データの扱い、苦情・問い合わせ窓口)、`/privacy/`(Google 広告 Cookie・アクセス解析)、`/ads-policy/`(広告掲載方針: PR 表記、並び順は固定、報酬情報は非公開)、`/404.html`。すべて `renderPage` を通す。
- [x] テスト: ページ数が 47+7 前後で maxPages 以下 / 東京ページに `<svg` と「前月」「全国」を含む / CTA が対象地域(13)にだけ出て、非対象(01)に出ない / active が無いとき CTA も disclosure も無い / 全ページに canonical / 出典文言を含む
- [ ] 実装 → PASS → lint

### Task 8: ゲート群(`src/gates/*.ts`)

各ゲートは `Gate` を返すファクトリ。fixture は PASS 用と FAIL 用を対で置く。
```ts
export function dataGate(store: Store): Gate           // G1: 47 県 / 値域 0.2..5.0 / 期間昇順・欠損なし / 前月比 ±30% 超で FAIL
export function sourceLivenessGate(urls: string[], deps: { fetch?: FetchLike }): Gate   // G2: すべて 200(HEAD→GET)
export function legalTextGate(pages: BuiltPage[], m: Monetization): Gate   // G3: hasAffiliate なら disclosure が <article> より前 / データページに「加工して作成」/ 禁止語彙 / sponsored rel
export function affiliateGate(pages: BuiltPage[], m: Monetization, deps: { fetch?: FetchLike }): Gate  // G4: 出現する a8/ASP URL が active allowlist のみ / リンク先 200
export function qualityGate(pages: BuiltPage[], site: SiteConfig): Gate   // G5: ページ数 / 内部リンク切れ / title・description・canonical / 派生値 4 種 / 開示文言 / 窓口
export function stalenessGate(store: Store, today: string): Gate           // G6: 90 日 WARN / 180 日 FAIL
```
- [ ] 各ゲートに PASS/FAIL テスト(最低 2 件ずつ)
- [ ] 実装 → PASS → lint

### Task 9: CLI(`src/cli/collect.ts` `check.ts` `build.ts` `cycle.ts`)と `src/cli/lib.ts`

- `collect`: 各アダプタを実行 → `mergeDataset` → `writeStore("data/normalized")` → raw を `data/raw/<metric>-<sha8>.<ext>` に保存 → 変更有無を stdout に出す。
- `check`: store と build 結果に対して全ゲートを実行し `toText()` を出力。FAIL で exit 1。`--offline` で G2/G4 のネットワーク検査をスキップ(CI の単体用)。
- `build`: `buildAllPages` → `site/` に書く(`index.html`、`sitemap.xml`、`robots.txt`、`.nojekyll`)。
- `cycle`: collect → build → check の順で実行し、check が FAIL なら exit 1(デプロイさせない)。
- [ ] テスト: `tests/cli/cycle.test.ts` で fake fetch + tmp dir を使い、正常系で site/index.html が生成され exit 0、異常データで exit 1 かつ site が更新されない
- [ ] 実装 → PASS → lint

### Task 10: GitHub 公開と自動運用開始

- [ ] `.github/workflows/ci.yml`(push: test + lint)
- [ ] `.github/workflows/cycle.yml`(`schedule: "0 3 * * 2"` + `workflow_dispatch`。`npm ci` → `npm run cycle` → `data/` に差分があれば bot コミット → `actions/upload-pages-artifact` → `actions/deploy-pages`。`permissions: contents: write, pages: write, id-token: write`)
- [ ] `.github/workflows/healthcheck.yml`(毎日: 公開 URL 200、出典 URL 200、active なアフィリエイト URL 200。失敗時 `gh issue create`)
- [ ] `gh repo create Harapanee/career-stats --public --source . --push`、`gh api -X POST repos/Harapanee/career-stats/pages -f build_type=workflow`
- [ ] `gh workflow run cycle.yml` → `gh run watch` → 成功ログ → `curl -sI https://harapanee.github.io/career-stats/` が 200
- [ ] `docs/data-sources.md`、HANDOFF.md 最終化(人待ちリスト・撤退基準・次サイクル確認手順・収益源の状態)

