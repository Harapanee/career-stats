# 就活・転職データラボ(career-stats)

就職・転職に関わる公的統計(有効求人倍率・新規求人倍率・完全失業率)を、統計ダッシュボード API から毎週自動取得し、公開ゲート(データ異常・出典死活・法令表記・収益リンク・品質・更新遅延)を通ったときだけ GitHub Pages に公開する完全自動運用メディア。

- 公開 URL: https://career.harateck.com/
- 運用の現在地・人待ちリスト: `HANDOFF.md`
- 設計: `docs/superpowers/specs/`、実装計画: `docs/superpowers/plans/`
- データ源の規約・robots 確認: `docs/data-sources.md`、法令確認: `docs/legal-review.md`

```bash
npm ci
npm test && npm run lint   # 終了コード 0 が正常
npm run cycle              # collect → build → check(FAIL なら site/ を削除して 1)
```

ワークフロー: `cycle.yml`(毎週火曜 12:00 JST)、`healthcheck.yml`(毎日 09:00 JST)、`ci.yml`(push)。
