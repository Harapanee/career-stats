# データ源・外部サービスの利用規約 / robots.txt 確認記録

確認日: 2026-09-18(Web 調査サブエージェント + 本セッションでの curl 実測)。再確認は `healthcheck.yml` が利用規約 URL の死活を日次で監視し、内容変更は年 1 回の人待ち項目として HANDOFF.md に載せる。

## 採用(主経路)

### D1 統計ダッシュボード API(e-Stat / 総務省統計局)
- 用途: 有効求人倍率(指標コード `0301020001000010010`)、新規求人倍率(`0301020002000010010`)、完全失業率(`0301010000020020010`)。月次、全国(`RegionalRank=2`)・都道府県別(`RegionalRank=3`)、原数値(`@isSeasonal=1`)と季節調整値(`@isSeasonal=2`)。
- アクセス: `https://dashboard.e-stat.go.jp/api/1.0/Json/getData?IndicatorCode=...&Cycle=1&RegionalRank=3&Time=20260700`。**利用登録不要**([API 仕様](https://dashboard.e-stat.go.jp/static/api) に「本APIは利用登録不要で、誰でもお使いいただけます」)。実測: HTTP 200 `application/json;charset=UTF-8`、都道府県別 94 件(47×原/季調)、全国 2015-01〜2026-07 で 278 件。
- 規約: [利用規約](https://dashboard.e-stat.go.jp/static/terms)(公共データ利用規約 PDL1.0 準拠。商用可)。必須表記: 「出典:統計ダッシュボード(https://dashboard.e-stat.go.jp/)」、加工時は「統計ダッシュボード(URL)のデータを加工して作成」+ **加工主体の記載**、API 利用サービスは「このサービスは、統計ダッシュボードのAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。」を表示。短時間の大量アクセス禁止。
- robots.txt: `https://dashboard.e-stat.go.jp/robots.txt` → 404(制限なし)。
- 更新: 元統計(一般職業紹介状況・労働力調査)の公表日(対象月の翌月末 8:30 JST)に同期。
- 判定: **採用可**。週 1 回・数リクエストの取得は「大量アクセス」に当たらない。

### D2 e-Stat ファイルダウンロード(職業別など、将来拡張用)
- 例: `https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040492553&fileKind=0`(一般職業紹介状況 第3表 有効求人倍率、Excel)。実測 HTTP 200。appId 不要。CSV(`fileKind=1`)は 404(未提供)。
- 規約: [e-Stat 利用規約](https://www.e-stat.go.jp/terms-of-use)(政府標準利用規約 2.0、CC BY 4.0 互換、商用可)。出典例「出典:「○○調査結果」(A省)」、加工例「「○○調査結果」(A省)を加工して作成」。
- robots.txt: `https://www.e-stat.go.jp/robots.txt` → 200。`/stat-search/file-download` に Disallow なし(Disallow は `/search/`, `/user/*`, `/admin/` 等のみ)。
- 注意: 月次の statInfId が据え置きか新規発番かは未確認 → Phase 2 で一覧ページのパースを実装するまで採用しない。
- 判定: **採用可(Phase 2)**。

### D3 厚生労働省「一般職業紹介状況」(出典の原典)
- 報道発表ページは月ごとに URL が変わり(`/stf/newpage_NNNNN.html`)、添付は PDF のみ。データ取得は D1/D2 経由とし、本サイトでは出典表記の名称として使う。
- 規約: [著作権・利用規約](https://www.mhlw.go.jp/chosakuken/index.html)(PDL1.0 準拠。出典「「○○動向調査」(厚生労働省)(URL)(取得日)」、加工「…を加工して作成」)。
- robots.txt: `Disallow: /cgi-bin/`, `/images/` のみ。`/stf/`, `/toukei/` は許可。

### D4 総務省統計局「労働力調査」(完全失業率の原典)
- データ本体は e-Stat/ダッシュボードにある。[利用について](https://www.stat.go.jp/info/riyou.html)(PDL1.0、CC BY 互換)。robots: `Disallow: /library/opac/` のみ。

## 採用(公開・配信・収益)

### S1 GitHub Pages / GitHub Actions
- [GitHub Pages 利用規約](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#prohibited-uses): 商用は「限定的」に許容(オンラインビジネスや SaaS の運用は不可、静的サイトの広告掲載は一般的に許容)。帯域 100GB/月、サイト 1GB、ビルド 10 回/時 のソフト制限。本サイトは静的で月次更新のため範囲内。独自ドメイン取得後も同じ。
- robots.txt: 本サイト自身が `robots.txt` を配信する(全許可 + sitemap)。

### S2 A8.net(アフィリエイト)
- [メディア会員利用規約](https://www.a8.net/compliance/media-userpolicy.php)、[禁止事項](https://www.a8.net/compliance/prohibited-matter.php)、[PR 表記](https://www.a8.net/compliance/prNotation-urlSubmission.php)。要件: 日本語・ログイン不要・広告コード改変禁止・報酬等の会員限定情報の公開禁止・PR 表記をファーストビューに。robots.txt は無関係(リンク先へ遷移するのみ)。
- 判定: **採用可**(提携は人が 1 回だけ行う)。

## 除外

| ソース | 理由 |
|---|---|
| doda 転職求人倍率レポート | [利用規約 13 条](https://doda.jp/material/kiyaku/001.html) 許諾のない複製・転載不可。curl も接続不可(bot 対策)。 |
| リクルート 転職市場動向 | [利用条件](https://www.recruit.co.jp/termsofuse/) 事前の書面承諾が必要。転職求人倍率は 2019 年に公表中止。 |
| jobtag(職業情報提供サイト) | API なし。ダウンロードページが bot 保護(Incapsula)で自動取得不可。回避は規約 10 条抵触リスク。年 1 回の手動 DL 運用は可能だが目的 1(完全自動)に反するため除外。 |
| 日本銀行 短観 | [著作権](https://www.boj.or.jp/about/copyright.htm) 商用目的の転載は事前相談が必要 → 人待ちにしない限り不可。除外。 |
| e-Stat API 3.0(appId) | 登録が必要(人待ち)。D1 で代替できるため主経路にしない。取得後は職業別データの拡張に使う。 |
| 新規学卒者離職状況・就職内定率(厚労省・文科省) | PDF のみ。PDF 表抽出は壊れやすく自動運用の安定性を損なうため Phase 1 では除外。Phase 2 の候補。 |
