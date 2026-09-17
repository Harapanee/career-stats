# 法令・プラットフォームポリシー確認記録

確認日: 2026-09-18 / 確認者: 設計セッション(Claude、Web 一次資料ベース)。
「確認済」= 一次資料で確認、「推定」= 解釈。推定のうち事業判断に効くものは HANDOFF.md の人待ちリストに照会項目として載せる。

## 1. 職業安定法(募集情報等提供事業)

- 確認済: 募集情報等提供は「労働者の募集に関する情報(個別求人)」または「求職者情報」の提供(法4条6項、[令和4年改正 Q&A](https://www.mhlw.go.jp/content/001250191.pdf) 問1-1)。一般的な情報配信で結果的に求人情報が含まれるだけなら非該当。
- 確認済: ネット広告として求人広告が表示されても、反復継続の意思がなければ非該当(問1-3)。
- 確認済: 届出が必要な「特定募集情報等提供」は求職者の個人情報(経歴・メール・閲覧履歴等)を収集して行うもの(問1-6)。利用者全体のアクセス集計は該当しない。
- 推定: **求人票を 1 件も掲載せず、公的統計と転職エージェントの役務広告(無料相談への誘導)だけを載せる本サイトは非該当の可能性が高い。** 明示した公的 Q&A は無い。
- 対応: (a) 個別求人(社名×職種×賃金)を載せない、(b) 会員登録・メール収集・閲覧履歴に基づく出し分けをしない、(c) 保険として苦情・問い合わせ窓口(メール)を全ページのフッターに常設、(d) 人待ち: 都道府県労働局 需給調整事業課へ 1 回だけ事前照会。

## 2. 景表法(ステマ規制・優良誤認)

- 確認済: アフィリエイト表示は事業者の表示([運用基準](https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/assets/representation_cms216_230328_03.pdf))。「広告」「PR」「プロモーション」の文言が明瞭な例。末尾・小さい文字は不明瞭。
- 確認済: [消費者庁 Q13](https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/stealth_marketing/) サイト冒頭の包括表記だけでなく、サイト全体の明瞭性で判断。
- 確認済: A8 は「本ページはプロモーションが含まれています」をファーストビューに、共通表示なら 1 ページの URL 提出で可([A8 案内](https://www.a8.net/compliance/prNotation-urlSubmission.php))。
- 確認済: No.1 表示は合理的根拠 4 要件([消費者庁報告書](https://www.caa.go.jp/policies/policy/representation/fair_labeling/survey/assets/representation_cms216_240926_02.pdf))。
- 対応: アフィリエイトを含むページは `<main>` 先頭に本文と同等以上の文字サイズで表記。CTA カードにも「PR」ラベル。エージェントを「ランキング」「No.1」「おすすめ度」で並べない。統計値の順位表は出典・時点・並べ替え基準をキャプションに明記(事実の並べ替え)。

## 3. Google 検索スパムポリシー

- 確認済([Spam Policies](https://developers.google.com/search/docs/essentials/spam-policies)): scaled content abuse(価値を加えない大量生成)、doorway(実質同一ページの地域別量産)、expired domain abuse、site reputation abuse(第三者コンテンツ掲載。アフィリエイトリンク自体は非該当と明記)。
- 確認済([生成 AI コンテンツ](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)): 自動生成でも正確性・有用性があれば可。作り方の開示を推奨。
- 対応: 1 指標×1 地域=1 URL(表記揺れの別 URL を作らない)、月次更新は同 URL 上書き、各ページに固有の図表・表・派生値(前月比・前年比・全国順位・過去最高/最低)を必須化(ゲート)、ブラウズ可能な階層(トップ→都道府県→指標)+パンくず、全ページに「自動生成・自動更新」の開示と運営者情報、新規ドメインのみ使用、`rel="sponsored"` 付与、更新停止データは noindex。

## 4. Google AdSense

- 確認済: 法人(Organization)で申請可、支払基準 ¥8,000、Auto ads で配置は自動([利用要件](https://support.google.com/adsense/answer/9724?hl=ja)、[Replicated content](https://support.google.com/publisherpolicies/answer/11190248))。
- 推定: 「手動レビューやキュレーションを欠く自動生成」は Replicated content 扱いのリスク。独自可視化・派生指標・編集方針ページで対応するが審査結果は保証不可。
- 対応: 申請はコンテンツ・ナビ・プライバシーポリシー(広告 Cookie 記載)・運営者情報が揃ってから(人待ち: アカウント作成と審査申込)。

## 5. A8.net 規約

- 確認済([利用規約](https://www.a8.net/compliance/media-userpolicy.php)、[禁止事項](https://www.a8.net/compliance/prohibited-matter.php)): 日本語・ログイン不要で閲覧可、広告コード改変禁止、報酬額・成果条件など会員限定情報の公開禁止、無差別大量提携申請禁止。生成 AI コンテンツへの明示規定なし。
- 対応: 提携は少数を人が 1 回だけ。リンク URL と ASP 素材を改変せず埋め込む。本文に報酬額・成果条件・確定率を出力しない(ゲートで「報酬」「成果条件」「円/件」を検出)。リンク先の死活を日次監視し、失効した CTA は自動撤去。

## 6. 有料データ販売(特商法・Stripe)

- 確認済: 通信販売の表示事項([特商法ガイド](https://www.no-trouble.caa.go.jp/what/mailorder/advertising.html))。法人+電子広告は代表者または業務責任者氏名、住所、電話番号が必要。Stripe 日本アカウントは特商法表記ページが必須。Payment Link は API で作成可。
- 対応: 法人の住所・電話番号は未提供 → 人待ち。提供後に `/tokusho/` ページを設定ファイルから生成。

## 7. 政府標準利用規約(第2.0版)

- 確認済([本文](https://www.digital.go.jp/assets/contents/node/basic_page/field_ref_resources/f7fde41d-ffca-4b2a-9b25-94b8a701a037/70143e67/20220523_resources_data_betten_03.pdf)): 複製・翻案・商用利用可。数値データ・簡単な表は著作権対象外。出典記載例「出典:『○○調査』(A省)(URL)(取得日)」、加工時は「『○○調査』(A省)(URL)を加工して作成」。国が作成したかのような態様は禁止。
- 対応: 全図表キャプションと各ページフッターに「出典 + 加工して作成(harateck)」を自動付与。

## 8. Instagram(既存パイプラインの補助利用)

- 確認済: Content Publishing API は 24 時間 100 件上限、反復的コンテンツはスパム判定リスク。
- 対応: 本サイトの統計カードを流用する場合は 1 日 2 本以下、テンプレをローテーション、キャプションに PR 表記と出典。今回は実装しない(将来の拡張)。
