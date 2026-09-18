# HANDOFF — 就活・転職データラボ(就職・転職 統計メディア、完全自動運用)

最終更新: 2026-09-18 10:30 JST(CLAUDE.md を追加。配信は Cloudflare Pages + career.harateck.com)
セッション再開時はまずこのファイル → `docs/superpowers/specs/2026-09-18-career-stats-media-design.md` の順に読む。

## 期限のあるもの(先頭に置く)
- Cloudflare API トークン(GitHub Secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`、2026-09-18 登録、有効期限なし)。権限: Account›Cloudflare Pages›Edit、Zone›DNS›Edit、Zone›Zone›Read。漏えい時は https://dash.cloudflare.com/profile/api-tokens で Roll し、`gh secret set CLOUDFLARE_API_TOKEN --repo Harapanee/career-stats` で差し替える。検証は `gh workflow run cf-verify.yml`。

## 現在地(2026-09-18)
- **公開中**: https://career.harateck.com/ (Cloudflare Pages プロジェクト `career-stats`、`career-stats.pages.dev` も同内容。HTTP 200 確認済み)。リポジトリ https://github.com/Harapanee/career-stats (public)。GitHub Pages は 2026-09-18 に停止(重複公開を避けるため)。
- **自動運用中**: `cycle.yml`(毎週火曜 12:00 JST、wrangler で Cloudflare Pages にデプロイ)、`healthcheck.yml`(毎日 09:00 JST)、`ci.yml`(push 時)。手動用: `cf-setup.yml`(Pages プロジェクト・カスタムドメイン・DNS を冪等に作る)、`cf-verify.yml`(トークン検証)。移行後の実行 ID 35294450983 が G1〜G6 全 PASS でデプロイ成功。
- 内容: 有効求人倍率(47 都道府県 + 全国)、新規求人倍率、完全失業率(全国)の月次時系列。57 ページ。データは統計ダッシュボード API(登録不要)から取得。
- テスト 164 件・lint 終了コード 0。
- 収益は現時点ゼロ(アフィリエイトリンク未発行、AdSense 未申請)。

## 人待ちリスト(人が用意しないと進まないもの。依存しない部分はすべて実装済み)
| # | 項目 | 用意されたらやること(自動化済み) | 影響する収益源 |
|---|---|---|---|
| 1 | **A8 で本サイトをメディア登録し、就職エージェントneo(プログラム ID s00000018427002)のリンク URL を発行** | `config/monetization.json` の `neo.url` に貼り、`status` を `active` にして push。次サイクルで対象 7 都府県の都道府県ページに PR 表記付き CTA が自動掲載される(ゲートがリンク死活と表記を検査) | R1 |
| 2 | A8 で「お仕事ラボ」(s00000017390001)に提携申請 → 承認後リンク発行 | 同上(`oshigoto-lab`)。ただし薬剤師向けページはまだ無いので、Phase 2 で職業別ページ(薬剤師の有効求人倍率)を追加してから有効化 | R1 |
| 3 | ~~独自ドメインの取得~~ **解消**(2026-09-18): 自社ドメインのサブドメイン career.harateck.com を採用。別ドメインに変えたい場合は `cf-setup.yml` の `DOMAIN` と `config/site.json` の `baseUrl` を変更して両方を実行 | — | R2 |
| 4 | Google Search Console の所有権確認(HTML タグ方式) | `config/site.json` の `searchConsoleVerification` にトークンを入れて push。sitemap は `/sitemap.xml` に生成済み | SEO 全般 |
| 5 | Google AdSense アカウント作成(法人 Organization 可)と審査申込 | `config/site.json` の `adsense.publisherId` を入れて push → Auto ads スクリプトが全ページに自動挿入される。審査は独自ドメイン・コンテンツ充実後に | R2 |
| 6 | Stripe アカウント + 特商法表記に必要な法人情報(住所・電話番号・責任者氏名) | `/tokusho/` ページ生成と Payment Link 掲載は Phase 3 で実装(未実装)。`config/monetization.json` の `paidData` を使う | R3 |
| 7 | (任意・保険)都道府県労働局 需給調整事業課へ「統計+エージェント広告のみのサイトは募集情報等提供事業に該当しないか」を 1 回照会 | 結果を `docs/legal-review.md` §1 に追記 | 法令 |
| 8 | (任意)設計書 `docs/superpowers/specs/…design.md` のレビュー。自動運用を止めずに読める | 修正があれば Phase 2 計画に反映 | — |
| 9 | (任意)e-Stat API の appId 登録 | 職業別・産業別データの拡張(Phase 2)に使う | コンテンツ拡張 |
| 10 | ~~Cloudflare API トークン~~ **解消**(2026-09-18 登録済み。冒頭「期限のあるもの」参照) | — | — |

## 撤退基準の数値(設計書 §8)
- 公開後 **6 か月**(2027-03-18)時点で Search Console の月間クリックが **300 未満**、かつ **9 か月**(2027-06-18)で **1,000 未満** → コンテンツ投資を止め、データ更新だけの維持モードへ。
- **12 か月**(2027-09-18)時点で月間収益(全収益源合計)が **5,000 円未満** → サイト売却または閉鎖を検討。
- ゲート G2(出典死活)が **連続 3 サイクル**(3 週)FAIL → 取得元の構造変更とみなし、この人待ちリストに「アダプタ改修」を追加。
- AdSense: 月 8,000 円未満は支払い繰越になるため、収益判定は繰越込みの発生額で見る。

## 次サイクルの確認手順(人は「通知を読むかどうか」だけ)
1. 何もしなくてよい。失敗時だけ GitHub からメール通知が来る(workflow 失敗)+ リポジトリに `automation` ラベルの Issue が自動作成される。
2. 確認したい場合: https://github.com/Harapanee/career-stats/actions で `cycle` の最新実行を開き、ログに `[check] PASS — 公開可能` と `[PASS] G1`〜`G6` が並んでいれば正常。`[FAIL]` があれば site/ は公開されず前回の公開内容が残る。
3. 公開内容: https://career.harateck.com/ のトップに「YYYY年M月時点」と表示される月が、厚労省の最新公表月(対象月の翌月末公表)と一致していれば更新済み。
4. 手動で回したいとき: `gh workflow run cycle.yml --ref main`(ローカルなら `npm run cycle`)。
5. ローカルで検証するとき: `npm test && npm run lint`(いずれも終了コード 0 が正常)。

## 収益源ごとの現在の状態
| 収益源 | 状態 | 次のアクション |
|---|---|---|
| R1 アフィリエイト(neo) | 提携済み・**リンク未発行** → CTA 非表示(config の status=pending) | 人待ち #1 |
| R1 アフィリエイト(お仕事ラボ) | 未提携 | 人待ち #2(Phase 2 の職業別ページ後) |
| R2 AdSense | 未申請(独自ドメインは揃った) | 人待ち #5 |
| R3 有料データ販売(Stripe) | 未実装(設計のみ) | 人待ち #6 → Phase 3 実装 |
| R4 直接契約 | お問い合わせ導線(フッターのメール)のみ | 流入が出てから |
| R5 サイト売却 | 出口基準のみ定義 | 12 か月後に判定 |

## 踏んだ罠・知見
- wrangler-action v3 のログに「npx canceled due to missing packages」が 1 行出るが、その後 wrangler を取得してアップロードが完了する(実行 ID 35294450983)。エラー扱いではない。
- Cloudflare Pages のカスタムドメインは追加直後 `status: initializing` だが、DNS(CNAME → career-stats.pages.dev、proxied)を入れると数分で有効になった。
- Cloudflare: セッション開始時の「cloudflare は認証が必要」は別項目(ユーザー設定の MCP)で、claude.ai コネクタ(bindings.mcp.cloudflare.com)は接続済み。ただしデプロイ・DNS のツールは無く wrangler も未ログインなので、公開経路としては使えない。通知だけで判断せず実際に 1 回呼んで確かめること。
- GitHub Actions の `schedule` は数時間遅延しうる(既存 *-delivery の記録)。週次なので許容。
- 統計ダッシュボード API は登録不要だが、完全失業率に都道府県別は無い(status "1" が返り `STATISTICAL_DATA` ごと欠落)。指標ごとに `prefectural` フラグで扱いを分けている。
- e-Stat のファイルダウンロードは CSV 未提供(Excel/PDF のみ)。月次 statInfId の据え置き有無は未確認 → Phase 2 で一覧ページのパースが必要。
- ストアの差分判定に `fetchedAt` を含めると毎回「変更あり」になり、データコミットが毎週発生する。観測値だけで digest を取るよう修正済み(2026-09-18)。
- Actions は UTC で動くため日付は JST に +9h して出す(`todayStr`)。
- G3 の禁止語「報酬」は広告ポリシー説明文にも効くので「対価」と書く。

## Phase 2 候補(実装計画は未作成)
- 職業別(中分類)の有効求人倍率ページ(e-Stat Excel or appId 取得後の API)。薬剤師ページ→お仕事ラボ CTA。
- 新規学卒者の離職率・内定率(PDF 抽出が必要)。
- 既存 IG リールパイプラインへの月次「統計カード」供給(1 日 2 本以下・PR 表記付き)。
- 有料データ販売(Stripe Payment Link + 特商法表記ページ)。
