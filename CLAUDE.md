# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## まず読む

セッション再開時は `HANDOFF.md`(現在地・人待ちリスト・踏んだ罠)→ `docs/superpowers/specs/2026-09-18-career-stats-media-design.md`(設計と法令ルール L1〜L13、ゲート G1〜G6)の順。作業を終えるたびに `HANDOFF.md` を更新する(Stop フックが更新漏れをブロックする)。目的の優先順は「完全自動運用 > マネタイズ」。人の定期作業を増やす変更はしない。

## コマンド

```bash
npm test                          # vitest 全件
npx vitest run tests/gates/legal.test.ts   # 単一ファイル
npx vitest run -t "prefecture"    # テスト名で絞る
npm run lint                      # eslint . && tsc --noEmit(両方 0 が必須)
npm run cycle                     # collect → build → check(実 API を叩く。FAIL なら site/ を削除して exit 1)
npm run cycle -- --offline        # G2/G4 のネットワーク死活を省く
npm run collect | build | check   # 各段階を個別に
npm run healthcheck               # 公開 URL・出典・有効アフィ URL の死活
gh workflow run cycle.yml --ref main   # GitHub 上で 1 サイクル実行
```

## アーキテクチャ(データフロー)

```
sources/dashboard.ts  統計ダッシュボード API(登録不要) → Dataset(正規化 JSON)
      ↓ normalize/store.ts   (region, period) キーでマージし data/normalized/<metric>.json にコミット
      ↓ normalize/derive.ts  前月差・前年同月差・全国順位・過去最高/最低・3か月トレンド(DerivedStats)
      ↓ render/pages.ts      全ページを BuiltPage[] として決定的に生成(text.ts の定型文、svg.ts の SVG、monetize/cta.ts の CTA、page.ts の共通レイアウト)
      ↓ gates/*.ts           G1 データ異常 / G2 出典死活 / G3 法令表記 / G4 収益リンク / G5 品質 / G6 更新遅延
      ↓ cli/lib.ts           runCycle: collect → build → check。1 つでも FAIL なら site/ を削除して 1 を返す
      ↓ .github/workflows/cycle.yml  週次 cron。成功時のみ data/ を bot コミットし wrangler で Cloudflare Pages へデプロイ
```

- すべて純粋関数中心。ネットワークは `FetchLike` を注入してテストする(`tests/cli/cycle.test.ts` が偽 API で e2e を回す)。
- ゲートは **HTML 出力も検査する**ため build を check の前に置く。ゲートを追加するときは `gates/run.ts` の `Gate` を返すファクトリを作り、PASS と FAIL の fixture を対で持つ。
- `render/types.ts` の `BuiltPage.isDataPage` と `hasAffiliate` がゲートの検査対象を決める。ページ種別を増やしたらこのフラグを正しく付ける。

## この repo 固有の制約(破るとゲートが落ちる)

- 文章は `render/text.ts` の定型文のみ。生成 AI の自由記述・乱数は使わない(Google の scaled content abuse 回避と事実性のため)。
- 禁止語彙(`gates/legal.ts` の `PROHIBITED_WORDS`): No.1 / 1位のエージェント / おすすめ度 / 満足度 / 必ず / 絶対 / 業界最高 / 報酬 / 成果条件 / 確定率 / 応募する / 求人詳細 / 求人番号 / 募集中 / 採用情報。固定ページの説明文にも効くので「報酬」は「対価」と書く。統計順位の「全国1位」は可。
- 個別の求人(社名×職種×賃金・応募導線)を載せない。会員登録・メール収集・閲覧履歴による出し分けをしない(職業安定法の届出回避)。
- アフィリエイトは `config/monetization.json` の `status: "active"` のみ表示。URL は ASP 発行のまま改変しない。`rel="sponsored nofollow noopener"` と PR ラベル、`<main>` 先頭の開示文は `page.ts` / `cta.ts` が自動付与する。
- 図表・データページには「出典 … を加工して作成」を付ける(政府標準利用規約)。
- 収益化・ドメイン・解析の切替はコードではなく `config/site.json` / `config/monetization.json` を変えて push する。
- 日付は JST(`cli/lib.ts` の `todayStr`)。Actions は UTC で動く。
- `site/` はビルド成果物で git 管理外。`data/normalized/` は bot がコミットするので、ローカル変更を push する前に `git pull --rebase`。

## 配信とシークレット

- 公開 URL: https://career.harateck.com/ (Cloudflare Pages プロジェクト `career-stats`)。GitHub Pages は停止済み。
- GitHub Secrets: `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`。検証は `gh workflow run cf-verify.yml`、Pages・ドメイン・DNS の再作成は `cf-setup.yml`(冪等)。
- ワークフロー: `cycle.yml`(週次)、`healthcheck.yml`(日次、失敗時に Issue 自動作成)、`ci.yml`(push)。`pull_request` トリガーは付けない(public リポジトリでフォークから secrets に触られないため)。

## 記録の置き場

設計は `docs/superpowers/specs/`、実装計画は `docs/superpowers/plans/`、データ源の規約と robots 確認は `docs/data-sources.md`、法令確認は `docs/legal-review.md`。新しいデータ源や収益源を足すときは、これらに規約・robots・法令の確認結果を先に書く。
