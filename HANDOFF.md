# HANDOFF — 就職・転職 統計メディア(完全自動運用)

最終更新: 2026-09-18 01:30(実装中: store/derive 完了(17テスト)。取得アダプタ・文章・CTA・ゲートを並列実装中)
セッション再開時はまずこのファイルを読む。次に `docs/superpowers/specs/` の設計書。

## 現在地
- 設計書草案 `docs/superpowers/specs/2026-09-18-career-stats-media-design.md` を作成(対象領域 A1 公的統計メディア / 収益 R1→R2→R3 段階化 / 技術 GitHub Pages + Actions cron を採用。比較表あり)。§4 法令ルールは調査結果待ちで未記入。
- 既存資産の調査完了(公開サイトは未存在。neo のアフィリエイトリンク URL は未発行=人待ち)。
- データ源・法令の Web 調査、SVG 図表モジュール実装(TDD)はサブエージェントで進行中。
- 実装済み: `src/gates/run.ts`(ゲートランナー、テスト 5 件 PASS)、`src/normalize/types.ts`、`src/render/sitemap.ts`(テストは svg.ts 完成後に実行)。
- 次の一手: 調査結果を設計書 §4 に反映 → `docs/data-sources.md` 作成 → 実装計画 `docs/superpowers/plans/` → 取得アダプタ・ゲート・HTML 生成 → GitHub リポジトリ作成・Pages 公開 → cron 登録 → 1 サイクル実行。
- 判定期限: 本セッション 200 ターン以内に公開・自動運用開始まで到達できなければ、この HANDOFF に現在地を書いて停止する。

## 新しく分かった知見(踏んだ罠候補)
- GitHub Actions の schedule は最大数時間遅延する(既存 *-delivery の運用記録)。週次サイクルなら問題ないが「時刻厳守」の処理には使わない。
- Cloudflare は MCP 未認証・wrangler 未ログインのため今は使えない。gh CLI は repo/workflow スコープで認証済み → GitHub Pages が人待ちゼロで公開できる唯一の経路。

## 人待ちリスト
(調査完了後に確定。以下は現時点で判明している候補)
- [ ] 独自ドメインの取得と DNS 設定(未提供。当面は GitHub Pages の既定 URL で公開)
- [ ] Google AdSense アカウント(未提供。独自ドメインが前提)
- [ ] Google Search Console の所有権確認(未提供)
- [ ] A8「お仕事ラボ」提携申請(未提携)
- [ ] Cloudflare 認証(未提供。GitHub Pages で代替するため必須ではない)

## 撤退基準の数値
(設計書確定後に記入)

## 次サイクルの確認手順
(実装後に記入)

## 収益源ごとの現在の状態
(設計書確定後に記入)
